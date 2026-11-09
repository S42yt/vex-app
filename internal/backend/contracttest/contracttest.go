package contracttest

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"sync"
	"testing"
)

type Exchange struct {
	Method   string          `json:"method"`
	Path     string          `json:"path"`
	Body     json.RawMessage `json:"body,omitempty"`
	Response any             `json:"response,omitempty"`
}

type Recorder struct {
	mu   sync.Mutex
	seen []Exchange
}

func (r *Recorder) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	body, _ := io.ReadAll(req.Body)
	r.mu.Lock()
	r.seen = append(r.seen, Exchange{Method: req.Method, Path: req.URL.Path, Body: body})
	r.mu.Unlock()
	w.Write([]byte("{}"))
}

func (r *Recorder) Seen() []Exchange {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Exchange(nil), r.seen...)
}

func Check(t *testing.T, xs []Exchange) {
	t.Helper()
	in, err := json.Marshal(xs)
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("bun", "../../contract/check.ts")
	cmd.Stdin = bytes.NewReader(in)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("contract check: %v\n%s", err, out)
	}
}
