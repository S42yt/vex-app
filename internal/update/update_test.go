package update

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sync/atomic"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

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

// fakeGitHub serves a release with the bare exe the default matcher picks, its SHA256SUMS
// and the NSIS installer; tamper corrupts the checksum.
func fakeGitHub(t *testing.T, tag string, tamper bool) (*httptest.Server, *atomic.Int32, []byte) {
	payload := bytes.Repeat([]byte("MZ new binary "), 1000)
	sum := sha256.Sum256(payload)
	if tamper {
		sum[0] ^= 1
	}
	asset := fmt.Sprintf("VexWave-%s-%s.exe", runtime.GOOS, runtime.GOARCH)
	sums := hex.EncodeToString(sum[:]) + "  " + asset + "\n"
	var hits atomic.Int32
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		switch r.URL.Path {
		case "/repos/" + repository + "/releases/latest":
			json.NewEncoder(w).Encode(map[string]any{
				"tag_name": tag,
				"assets": []map[string]any{
					{"name": "VexWave-installer.exe", "size": 10, "browser_download_url": srv.URL + "/dl/setup", "url": srv.URL + "/dl/setup"},
					{"name": asset, "size": len(payload), "browser_download_url": srv.URL + "/dl/app", "url": srv.URL + "/dl/app"},
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
	s := &UpdateService{Updater: u, Busy: &busy.Registry{}, Installed: func() bool { return false }}
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
	if got, _ := os.ReadFile(s.Updater.DownloadedPath()); !bytes.Equal(got, payload) {
		t.Fatal("staged bytes differ")
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
	canary := &UpdateService{Busy: &busy.Registry{}}
	if canary.Check(context.Background()).LatestVersion != "" || canary.Download() == nil {
		t.Fatal("canary offered an update")
	}
}
