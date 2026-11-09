package netx_test

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/media/mediatest"
	"github.com/VexWave/vex-app/internal/netx"
	"golang.org/x/net/http/httpproxy"
)

func gzipBackend() (*mediatest.FakeBackend, *httptest.Server) {
	data := bytes.Repeat([]byte("audio-bytes "), 100_000)
	be := &mediatest.FakeBackend{Token: "t", Tracks: map[string][]byte{"a": data}, ContentType: "audio/mpeg", GzipIfAsked: true}
	return be, httptest.NewServer(be)
}

func fetch(t *testing.T, c *http.Client, u string) *http.Response {
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("Authorization", "t")
	res, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestDefaultTransportAddsGzip(t *testing.T) {
	be, srv := gzipBackend()
	defer srv.Close()
	res := fetch(t, &http.Client{Transport: &http.Transport{}}, srv.URL+"/track/a/audio")
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(be.Log()[0], "ae=gzip") {
		t.Fatalf("request did not offer gzip: %v", be.Log())
	}
	if !res.Uncompressed || res.ContentLength != -1 || res.Header.Get("Content-Encoding") != "" {
		t.Fatalf("uncompressed=%v len=%d ce=%q", res.Uncompressed, res.ContentLength, res.Header.Get("Content-Encoding"))
	}
	if len(body) != 1_200_000 {
		t.Fatal(len(body))
	}
	t.Logf("default transport: Uncompressed=%v ContentLength=%d", res.Uncompressed, res.ContentLength)
}

func TestDisableCompression(t *testing.T) {
	be, srv := gzipBackend()
	defer srv.Close()
	res := fetch(t, &http.Client{Transport: &http.Transport{DisableCompression: true}}, srv.URL+"/track/a/audio")
	io.Copy(io.Discard, res.Body)
	res.Body.Close()
	if strings.Contains(be.Log()[0], "gzip") || res.ContentLength != 1_200_000 {
		t.Fatalf("log %v len %d", be.Log(), res.ContentLength)
	}
}

func TestRangeRequestsSkipAutoGzip(t *testing.T) {
	be, srv := gzipBackend()
	defer srv.Close()
	req, _ := http.NewRequest("GET", srv.URL+"/track/a/audio", nil)
	req.Header.Set("Authorization", "t")
	req.Header.Set("Range", "bytes=0-")
	res, err := (&http.Client{Transport: &http.Transport{}}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if strings.Contains(be.Log()[0], "gzip") {
		t.Fatalf("range request offered gzip: %v", be.Log())
	}
}

func mustURL(s string) *url.URL { u, _ := url.Parse(s); return u }

func TestNoProxy(t *testing.T) {
	proxy := mustURL("http://proxy.corp:8080")
	targets := []string{"https://music.internal.corp/x", "https://example.com/x", "http://127.0.0.1:5000/x", "http://localhost:5000/x"}

	fixed := http.ProxyURL(proxy)
	cfg := httpproxy.Config{HTTPProxy: proxy.String(), HTTPSProxy: proxy.String(), NoProxy: ".internal.corp"}
	fn := cfg.ProxyFunc()
	for _, tgt := range targets {
		u := mustURL(tgt)
		a, _ := fixed(&http.Request{URL: u})
		b, _ := fn(u)
		t.Logf("%-32s ProxyURL=%v httpproxy=%v", tgt, a, b)
	}
	if p, _ := fn(mustURL(targets[0])); p != nil {
		t.Error("NO_PROXY suffix not honoured")
	}
	if p, _ := fixed(&http.Request{URL: mustURL(targets[0])}); p == nil {
		t.Error("ProxyURL unexpectedly honoured NO_PROXY")
	}
	if p, _ := fn(mustURL(targets[2])); p != nil {
		t.Error("loopback proxied")
	}
	if p, _ := fn(mustURL(targets[1])); p == nil {
		t.Error("public host not proxied")
	}
}

func TestProxy407(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Proxy-Authenticate", `Basic realm="corp"`)
		w.WriteHeader(http.StatusProxyAuthRequired)
	}))
	defer proxy.Close()
	c := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(mustURL(proxy.URL))}, Timeout: 5 * time.Second}

	res, err := c.Get("http://backend.example/x")
	if err != nil || res.StatusCode != 407 {
		t.Fatalf("http target: %v %v", res, err)
	}
	res.Body.Close()

	_, err = c.Get("https://backend.example/x")
	if err == nil {
		t.Fatal("https target: expected error")
	}
	var ue *url.Error
	t.Logf("https target error: %q (type %T, url.Error=%v)", err, errors.Unwrap(err), errors.As(err, &ue))
	if !strings.Contains(err.Error(), "Proxy Authentication Required") {
		t.Fatalf("unexpected text %q", err)
	}
}

func TestCertErrorsTyped(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()
	_, err := http.Get(srv.URL)
	var cve *tls.CertificateVerificationError
	var ua x509.UnknownAuthorityError
	if !errors.As(err, &cve) || !errors.As(err, &ua) {
		t.Fatalf("got %T %v", err, err)
	}

	pool := x509.NewCertPool()
	pool.AddCert(srv.Certificate())
	c := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool}}}
	_, port, _ := net.SplitHostPort(srv.Listener.Addr().String())
	_, err = c.Get("https://localhost:" + port)
	var he x509.HostnameError
	if !errors.As(err, &cve) || !errors.As(err, &he) {
		t.Fatalf("got %T %v", err, err)
	}
}

func TestRetryAfterDate(t *testing.T) {
	when := time.Now().Add(90 * time.Second).UTC().Format(http.TimeFormat)
	at, err := http.ParseTime(when)
	if err != nil {
		t.Fatal(err)
	}
	if d := time.Until(at); d < 80*time.Second || d > 91*time.Second {
		t.Fatal(d)
	}
}

func TestProxy407Typed(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusProxyAuthRequired)
	}))
	defer proxy.Close()
	tr := &http.Transport{
		Proxy: http.ProxyURL(mustURL(proxy.URL)),
		OnProxyConnectResponse: func(_ context.Context, _ *url.URL, _ *http.Request, res *http.Response) error {
			if res.StatusCode == http.StatusProxyAuthRequired {
				return &netx.ProxyAuthError{}
			}
			return nil
		},
	}
	_, err := (&http.Client{Transport: tr}).Get("https://backend.example/x")
	var pe *netx.ProxyAuthError
	if !errors.As(err, &pe) {
		t.Fatalf("got %T %v", err, err)
	}
}
