// Package netx builds the outbound HTTP clients and describes their failures.
package netx

import (
	"context"
	"crypto/tls"
	"errors"
	"net/http"
	"net/url"
	"sync"

	"golang.org/x/net/http/httpproxy"
)

// ProxyAuthError is a proxy's 407 to a CONNECT, which Go otherwise reports only as text.
type ProxyAuthError struct{}

func (*ProxyAuthError) Error() string { return "proxy authentication required" }

// Clients are the two transports for one proxy setting.
type Clients struct {
	Proxy string
	// API offers gzip; Stream doesn't, so a whole-file response keeps its Content-Length.
	API, Stream *http.Client
}

var (
	mu   sync.Mutex
	last *Clients
)

// For returns the clients for proxy, reusing the last pair while the proxy stays the same,
// since a transport pools its connections per proxy.
func For(proxy string) *Clients {
	mu.Lock()
	defer mu.Unlock()
	if last == nil || last.Proxy != proxy {
		last = &Clients{proxy, &http.Client{Transport: transport(proxy, false)}, &http.Client{Transport: transport(proxy, true)}}
	}
	return last
}

func transport(proxy string, noGzip bool) *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.DisableCompression = noGzip
	t.Proxy = nil
	if proxy != "" {
		fn := (&httpproxy.Config{HTTPProxy: proxy, HTTPSProxy: proxy, NoProxy: noProxy()}).ProxyFunc()
		t.Proxy = func(r *http.Request) (*url.URL, error) { return fn(r.URL) }
	}
	t.OnProxyConnectResponse = func(_ context.Context, _ *url.URL, _ *http.Request, res *http.Response) error {
		if res.StatusCode == http.StatusProxyAuthRequired {
			return &ProxyAuthError{}
		}
		return nil
	}
	return t
}

func noProxy() string { return httpproxy.FromEnvironment().NoProxy }

// CertRejected reports whether err is a TLS certificate failure.
func CertRejected(err error) bool {
	var cve *tls.CertificateVerificationError
	return errors.As(err, &cve)
}

// Unreachable describes a request that never got an HTTP response.
func Unreachable(baseURL, proxy string, err error) string {
	if proxy == "" {
		if CertRejected(err) {
			return "Cannot reach " + baseURL + " — its certificate was rejected."
		}
		return "Cannot reach " + baseURL + " — is the server running?"
	}
	host := "the given address"
	if u, perr := url.Parse(proxy); perr == nil && u.Host != "" {
		host = u.Host
	}
	via := baseURL + " through the proxy at " + host
	if CertRejected(err) {
		return "Cannot reach " + via + " — the server's or the proxy's certificate was rejected."
	}
	return "Cannot reach " + via + " — check its address and credentials."
}
