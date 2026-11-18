package netx

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func answer(name string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, name) }))
}

func TestProxyChoice(t *testing.T) {
	env, explicit, direct := answer("env"), answer("explicit"), answer("direct")
	defer env.Close()
	defer explicit.Close()
	defer direct.Close()
	t.Setenv("HTTP_PROXY", env.URL)
	t.Setenv("NO_PROXY", "")
	for _, c := range []struct{ proxy, target, want string }{
		{"", "http://backend.example/x", "env"},
		{"", direct.URL, "direct"},
		{explicit.URL, "http://backend.example/x", "explicit"},
	} {
		res, err := (&http.Client{Transport: transport(c.proxy, false)}).Get(c.target)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if string(b) != c.want {
			t.Errorf("proxy %q, %s: reached %s, want %s", c.proxy, c.target, b, c.want)
		}
	}
}
