package update

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
	"golang.org/x/sys/windows"
)

func TestMain(m *testing.M) {
	if os.Getenv("SLEEP_THEN_EXIT") != "" {
		time.Sleep(700 * time.Millisecond)
		os.Exit(0)
	}
	exe, _ := os.Executable()
	if target := os.Getenv("BREAK_THEN_FAIL"); target != "" && filepath.Base(exe) == installerAsset {
		os.WriteFile(target, nil, 0o644)
		os.Exit(1)
	}
	if dir := os.Getenv("WRITE_MARKER"); dir != "" {
		os.WriteFile(filepath.Join(dir, filepath.Base(exe)), []byte(windows.UTF16PtrToString(windows.GetCommandLine())), 0o644)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

type host struct{ events chan string }

func (h host) Emit(name string, _ ...any) bool                       { h.events <- name; return true }
func (h host) OnEvent(string, func(any)) func()                      { return func() {} }
func (h host) OpenWindow(updater.WindowOptions) updater.WindowHandle { return nil }
func (h host) Quit()                                                 {}

func (h host) wait(t *testing.T, name string) {
	t.Helper()
	for {
		select {
		case e := <-h.events:
			if e == name {
				return
			}
		case <-time.After(10 * time.Second):
			t.Fatalf("no %s", name)
		}
	}
}

func fakeGitHub(t *testing.T, tag string, tamper bool) (*httptest.Server, *atomic.Int32, []byte) {
	payload := bytes.Repeat([]byte("MZ new binary "), 1000)
	sum := sha256.Sum256(payload)
	if tamper {
		sum[0] ^= 1
	}
	sums := hex.EncodeToString(sum[:]) + "  " + installerAsset + "\n"
	var hits atomic.Int32
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		switch r.URL.Path {
		case "/repos/" + repository + "/releases/latest":
			json.NewEncoder(w).Encode(map[string]any{
				"tag_name": tag,
				"assets": []map[string]any{
					{"name": "VexWave-windows-amd64.exe", "size": 10, "browser_download_url": srv.URL + "/dl/exe", "url": srv.URL + "/dl/exe"},
					{"name": installerAsset, "size": len(payload), "browser_download_url": srv.URL + "/dl/app", "url": srv.URL + "/dl/app"},
					{"name": "SHA256SUMS", "size": len(sums), "browser_download_url": srv.URL + "/dl/sums", "url": srv.URL + "/dl/sums"},
				},
			})
		case "/dl/app":
			w.Write(payload)
		case "/dl/sums":
			fmt.Fprint(w, sums)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &hits, payload
}

func service(t *testing.T, srv *httptest.Server, version string) (*UpdateService, host) {
	h := host{make(chan string, 1000)}
	u := updater.New(h)
	if err := configure(u, version, github.Config{Repository: repository, BaseURL: srv.URL, ChecksumAsset: "SHA256SUMS", HTTPClient: &http.Client{Transport: proxied(func() string { return "" })}}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if p := u.DownloadedPath(); p != "" {
			os.RemoveAll(p + "/..")
		}
	})
	s := &UpdateService{Updater: u, Busy: &busy.Registry{}, InstallDir: func() (string, bool) { return "", false }}
	s.ServiceStartup(context.Background(), application.ServiceOptions{})
	return s, h
}

func TestDownloadThenInstallRefusals(t *testing.T) {
	srv, hits, payload := fakeGitHub(t, "v0.8.0", false)
	s, h := service(t, srv, "0.7.0")

	if err := s.Download(); err == nil || err.Error() != "There is no update to download." {
		t.Fatalf("download before check: %v", err)
	}
	var refusal *Refusal
	if err := s.Install(context.Background()); !errors.As(err, &refusal) || !refusal.DownloadMissing {
		t.Fatalf("install before download: %v", err)
	}
	if got := s.Check(context.Background()); got.LatestVersion != "0.8.0" {
		t.Fatalf("check: %+v", got)
	}
	if err := s.Download(); err != nil {
		t.Fatal(err)
	}
	if err := s.Download(); err == nil || err.Error() != "The update is already downloading." {
		t.Fatalf("second download: %v", err)
	}
	if err := s.Install(context.Background()); !errors.As(err, &refusal) || refusal.DownloadMissing {
		t.Fatalf("install during download: %v", err)
	}
	h.wait(t, updater.EventDownloadProgress)
	h.wait(t, updater.EventUpdateReady)
	time.Sleep(10 * time.Millisecond) // the download goroutine releases its token after the event
	if got, _ := os.ReadFile(s.Updater.DownloadedPath()); !bytes.Equal(got, payload) || filepath.Base(s.Updater.DownloadedPath()) != installerAsset {
		t.Fatalf("staged %s, not the installer", s.Updater.DownloadedPath())
	}
	if hits.Load() < 3 {
		t.Fatalf("%d requests reached the fake GitHub", hits.Load())
	}
	if err := s.Install(context.Background()); err == nil || err.Error() != "Only an installed copy of VexWave can update itself." {
		t.Fatalf("install from a dev copy: %v", err)
	}
	if b, _ := json.Marshal(&Refusal{Message: "x", DownloadMissing: true}); string(b) != `{"error":"x","downloadMissing":true}` {
		t.Fatalf("refusal JSON %s", b)
	}
}

func TestTamperedDownloadFails(t *testing.T) {
	srv, _, _ := fakeGitHub(t, "v0.8.0", true)
	s, h := service(t, srv, "0.7.0")
	s.Check(context.Background())
	if err := s.Download(); err != nil {
		t.Fatal(err)
	}
	h.wait(t, updater.EventError)
	time.Sleep(10 * time.Millisecond)
	if err := s.Download(); err != nil {
		t.Fatalf("retry after a failed download: %v", err)
	}
	h.wait(t, updater.EventError)
}

func TestNoUpdate(t *testing.T) {
	srv, _, _ := fakeGitHub(t, "v0.7.0", false)
	s, _ := service(t, srv, "0.7.0")
	if got := s.Check(context.Background()); got.LatestVersion != "" {
		t.Fatalf("same version offered: %+v", got)
	}
	if got := pickInstaller(updater.CheckRequest{}, []github.ReleaseAsset{{Name: "VexWave-windows-amd64.exe"}, {Name: "SHA256SUMS"}}); got != -1 {
		t.Fatalf("picked asset %d from a release without the installer", got)
	}
	canary := &UpdateService{Busy: &busy.Registry{}}
	if canary.Check(context.Background()).LatestVersion != "" || canary.Download() == nil {
		t.Fatal("canary offered an update")
	}
}

func TestSweepLeftovers(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("TMP", filepath.Join(dir, "temp"))
	exe := filepath.Join(dir, "VexWave.exe")
	for _, f := range []string{"VexWave.exe", "uninstall.exe", "wails-update-42/VexWave-installer.exe", "temp/vexwave-update-helper-x.exe", "temp/vexwave-uninstall-helper-y.exe", "temp/other.exe"} {
		os.MkdirAll(filepath.Dir(filepath.Join(dir, f)), 0o755)
		os.WriteFile(filepath.Join(dir, f), []byte("x"), 0o644)
	}
	sweep(exe)
	var left []string
	filepath.WalkDir(dir, func(p string, d os.DirEntry, _ error) error {
		if !d.IsDir() {
			rel, _ := filepath.Rel(dir, p)
			left = append(left, filepath.ToSlash(rel))
		}
		return nil
	})
	if fmt.Sprint(left) != "[VexWave.exe temp/other.exe uninstall.exe]" {
		t.Fatalf("left %v", left)
	}
}

func fakeInstall(t *testing.T) (installer, exe, markers string) {
	dir := filepath.Join(t.TempDir(), "Programs", "Vex Wave")
	os.MkdirAll(dir, 0o755)
	installer, exe = filepath.Join(t.TempDir(), installerAsset), filepath.Join(dir, "VexWave.exe")
	for _, dst := range []string{installer, exe} {
		self, _ := os.Open(os.Args[0])
		fake, _ := os.Create(dst)
		io.Copy(fake, self)
		self.Close()
		fake.Close()
	}
	markers = t.TempDir()
	t.Setenv("WRITE_MARKER", markers)
	return installer, exe, markers
}

func waitRelaunch(t *testing.T, markers string) {
	t.Helper()
	for range 100 {
		if _, err := os.Stat(filepath.Join(markers, "VexWave.exe")); err == nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("the app was never relaunched")
}

func TestHelperWaitsThenInstallsAndRelaunches(t *testing.T) {
	installer, exe, markers := fakeInstall(t)

	app := exec.Command(os.Args[0], "-test.run=^$")
	app.Env = append(os.Environ(), "SLEEP_THEN_EXIT=1", "WRITE_MARKER=")
	if err := app.Start(); err != nil {
		t.Fatal(err)
	}
	defer app.Wait()
	start := time.Now()

	if err := Helper(strconv.Itoa(app.Process.Pid), installer, exe); err != nil {
		t.Fatal(err)
	}
	if took := time.Since(start); took < 500*time.Millisecond {
		t.Fatalf("ran the installer after %v, before the app exited", took)
	}
	if got, err := os.ReadFile(filepath.Join(markers, installerAsset)); err != nil || !strings.HasSuffix(string(got), `" /S /D=`+filepath.Dir(exe)) {
		t.Fatalf("installer command line: %q %v", got, err)
	}
	if _, err := os.Stat(exe + ".old"); !os.IsNotExist(err) {
		t.Fatalf("backup left behind: %v", err)
	}
	waitRelaunch(t, markers)
}

func TestHelperRestoresAfterFailedInstall(t *testing.T) {
	installer, exe, markers := fakeInstall(t)
	before, _ := os.ReadFile(exe)
	t.Setenv("BREAK_THEN_FAIL", exe)

	if err := Helper("0", installer, exe); err == nil {
		t.Fatal("a failed install reported success")
	}
	if after, _ := os.ReadFile(exe); !bytes.Equal(after, before) {
		t.Fatalf("exe not restored: %d bytes, was %d", len(after), len(before))
	}
	waitRelaunch(t, markers)
}
