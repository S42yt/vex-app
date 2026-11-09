// The Wails v3.1.0 updater with the GitHub provider against a fake GitHub API:
// digest-only (no PublicKey) installs, a bad digest is refused, a PublicKey makes
// the GitHub provider's digest-only releases fail closed, and HTTPClient carries all traffic.
package updatertest

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sync/atomic"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

type host struct{ events []string }

func (h *host) Emit(name string, _ ...any) bool                       { h.events = append(h.events, name); return true }
func (h *host) OnEvent(string, func(any)) func()                      { return func() {} }
func (h *host) OpenWindow(updater.WindowOptions) updater.WindowHandle { return nil }
func (h *host) Quit()                                                 {}

type counting struct {
	n  atomic.Int32
	rt http.RoundTripper
}

func (c *counting) RoundTrip(r *http.Request) (*http.Response, error) {
	c.n.Add(1)
	return c.rt.RoundTrip(r)
}

func fakeGitHub(t *testing.T, payload []byte, sums string) *httptest.Server {
	asset := fmt.Sprintf("VexWave-%s-%s.exe", runtime.GOOS, runtime.GOARCH)
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/o/r/releases/latest":
			json.NewEncoder(w).Encode(map[string]any{
				"tag_name": "v0.8.0", "name": "0.8.0", "body": "notes",
				"assets": []map[string]any{
					{"name": asset, "size": len(payload), "browser_download_url": srv.URL + "/dl/app", "url": srv.URL + "/dl/app", "content_type": "application/octet-stream"},
					{"name": "SHA256SUMS", "size": len(sums), "browser_download_url": srv.URL + "/dl/sums", "url": srv.URL + "/dl/sums", "content_type": "text/plain"},
					{"name": "VexWave-Setup.exe", "size": 10, "browser_download_url": srv.URL + "/dl/setup", "url": srv.URL + "/dl/setup"},
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
	return srv
}

func run(t *testing.T, sums func(payload []byte) string, key []byte) (*updater.Updater, error, *counting) {
	payload := bytes.Repeat([]byte("MZ new binary "), 1000)
	srv := fakeGitHub(t, payload, sums(payload))
	c := &counting{rt: http.DefaultTransport}
	gh, err := github.New(github.Config{
		Repository: "o/r", BaseURL: srv.URL, ChecksumAsset: "SHA256SUMS",
		HTTPClient: &http.Client{Transport: c},
	})
	if err != nil {
		t.Fatal(err)
	}
	u := updater.New(&host{})
	err = u.Init(updater.Config{
		CurrentVersion: "0.7.0",
		PublicKey:      key,
		Window:         updater.WindowNone,
		Providers:      []updater.Provider{gh},
	})
	if err != nil {
		t.Fatal(err)
	}
	rel, err := u.Check(context.Background())
	if err != nil || rel == nil {
		t.Fatalf("check: %v %v", rel, err)
	}
	t.Logf("found %s (asset picked by default matcher)", rel.Version)
	err = u.DownloadAndInstall(context.Background())
	if err == nil {
		got, _ := os.ReadFile(u.DownloadedPath())
		if !bytes.Equal(got, payload) {
			t.Fatal("staged bytes differ")
		}
	}
	return u, err, c
}

func goodSums(p []byte) string {
	s := sha256.Sum256(p)
	return hex.EncodeToString(s[:]) + "  VexWave-" + runtime.GOOS + "-" + runtime.GOARCH + ".exe\n"
}

func TestDigestOnlyInstallsWithoutKey(t *testing.T) {
	u, err, c := run(t, goodSums, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("state %s, staged at %s, %d requests through the injected HTTPClient", u.State(), u.DownloadedPath(), c.n.Load())
	if u.State() != updater.StateReady || c.n.Load() < 3 {
		t.Fatal(u.State())
	}
}

func TestBadDigestRefused(t *testing.T) {
	_, err, _ := run(t, func(p []byte) string { return goodSums(append(p, '!')) }, nil)
	t.Logf("bad digest: %v", err)
	if err == nil {
		t.Fatal("tampered binary installed")
	}
}

func TestKeyMakesGitHubDigestOnlyFailClosed(t *testing.T) {
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	_, err, _ := run(t, goodSums, pub)
	t.Logf("with PublicKey: %v", err)
	if err == nil {
		t.Fatal("digest-only release accepted with a PublicKey configured")
	}
}
