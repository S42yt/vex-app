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

type ProxyAuthError struct{}

func (*ProxyAuthError) Error() string { return "proxy authentication required" }

type Clients struct {
	Proxy string
	// API offers gzip; Stream doesn't, so a whole-file response keeps its Content-Length.
	API, Stream *http.Client
}

var (
	mu   sync.Mutex
	last *Clients
)

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
	cfg := httpproxy.FromEnvironment()
	if proxy != "" {
		cfg.HTTPProxy, cfg.HTTPSProxy = proxy, proxy
	}
	fn := cfg.ProxyFunc()
	t.Proxy = func(r *http.Request) (*url.URL, error) { return fn(r.URL) }
	t.OnProxyConnectResponse = func(_ context.Context, _ *url.URL, _ *http.Request, res *http.Response) error {
		if res.StatusCode == http.StatusProxyAuthRequired {
			return &ProxyAuthError{}
		}
		return nil
	}
	return t
}

func CertRejected(err error) bool {
	var cve *tls.CertificateVerificationError
	return errors.As(err, &cve)
}

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
