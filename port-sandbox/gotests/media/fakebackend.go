package media

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// FakeBackend serves /tracks/<id>/audio like contract.ts's audio route.
type FakeBackend struct {
	Token       string
	Tracks      map[string][]byte
	ContentType string
	// BytesPerSec throttles the body (0 = unthrottled).
	BytesPerSec int
	// GzipIfAsked mimics a reverse proxy that compresses when the client offers gzip.
	GzipIfAsked bool
	// Chunked answers a whole-file request without Content-Length.
	Chunked bool

	Sent     atomic.Int64
	mu       sync.Mutex
	Requests []string
}

type throttled struct {
	http.ResponseWriter
	rate int
	sent *atomic.Int64
}

func (t throttled) Write(p []byte) (int, error) {
	written := 0
	for len(p) > 0 {
		n := min(len(p), 16<<10)
		m, err := t.ResponseWriter.Write(p[:n])
		written += m
		t.sent.Add(int64(m))
		if err != nil {
			return written, err
		}
		if f, ok := t.ResponseWriter.(http.Flusher); ok {
			f.Flush()
		}
		if t.rate > 0 {
			time.Sleep(time.Duration(n) * time.Second / time.Duration(t.rate))
		}
		p = p[n:]
	}
	return written, nil
}

func (b *FakeBackend) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	b.Requests = append(b.Requests, r.Method+" "+r.URL.Path+" range="+r.Header.Get("Range")+" ae="+r.Header.Get("Accept-Encoding"))
	b.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer "+b.Token {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/tracks/"), "/audio")
	data, ok := b.Tracks[id]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if b.ContentType != "" {
		w.Header().Set("Content-Type", b.ContentType)
	}
	if b.GzipIfAsked && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") && r.Header.Get("Range") == "" {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		zw.Write(data)
		zw.Close()
		w.Header().Set("Content-Encoding", "gzip")
		w.Write(buf.Bytes())
		return
	}
	if b.Chunked && r.Header.Get("Range") == "" {
		throttled{w, b.BytesPerSec, &b.Sent}.Write(data) // flushes per 16 KiB, so no Content-Length
		return
	}
	http.ServeContent(throttled{w, b.BytesPerSec, &b.Sent}, r, "", time.Time{}, bytes.NewReader(data))
}

func (b *FakeBackend) Log() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]string(nil), b.Requests...)
}
