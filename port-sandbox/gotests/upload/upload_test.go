package upload

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func writeRandom(t *testing.T, size int64) (string, [32]byte) {
	path := filepath.Join(t.TempDir(), "track.mp3")
	f, _ := os.Create(path)
	h := sha256.New()
	io.CopyN(io.MultiWriter(f, h), rand.Reader, size)
	f.Close()
	var sum [32]byte
	copy(sum[:], h.Sum(nil))
	return path, sum
}

// A 75 MiB (the contract maximum) track streams through with a correct
// Content-Length, decodes to identical bytes, and allocates far less than its size.
func TestStreamedUploadMaxSize(t *testing.T) {
	path, want := writeRandom(t, MaxAudioBytes)
	spool := filepath.Join(t.TempDir(), "body.json")
	var gotLen int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotLen = r.ContentLength
		f, _ := os.Create(spool)
		n, _ := io.Copy(f, r.Body)
		f.Close()
		if n != r.ContentLength {
			http.Error(w, "short body", 400)
			return
		}
		w.WriteHeader(201)
	}))
	defer srv.Close()

	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	res, err := Send(context.Background(), http.DefaultClient, srv.URL+"/tracks", "tok",
		Meta{Title: "Ünïcode \"quoted\" title", DurationMs: 215000, ArtistIDs: []int32{3, 9}, Cover: []byte{1, 2, 3}}, path)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	runtime.ReadMemStats(&after)
	if res.StatusCode != 201 {
		t.Fatal(res.Status)
	}
	alloc := after.TotalAlloc - before.TotalAlloc
	t.Logf("body %d bytes (75 MiB file), allocated during upload: %.1f MiB", gotLen, float64(alloc)/(1<<20))
	if alloc > 8<<20 {
		t.Fatalf("upload allocated %d bytes", alloc)
	}

	raw, _ := os.ReadFile(spool)
	var got struct {
		Title     string  `json:"title"`
		Duration  int     `json:"duration"`
		ArtistIDs []int32 `json:"artistIds"`
		Cover     []byte  `json:"cover"`
		Data      []byte  `json:"data"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if sha256.Sum256(got.Data) != want || got.Title != "Ünïcode \"quoted\" title" || got.Duration != 215000 || len(got.ArtistIDs) != 2 || string(got.Cover) != "\x01\x02\x03" {
		t.Fatalf("decoded body mismatch: %q %d %v", got.Title, got.Duration, got.ArtistIDs)
	}
}

func TestTooLargeRefusedBeforeReading(t *testing.T) {
	path, _ := writeRandom(t, MaxAudioBytes+1)
	_, err := Send(context.Background(), http.DefaultClient, "http://127.0.0.1:1/tracks", "tok", Meta{Title: "x"}, path)
	if err != ErrTooLarge {
		t.Fatal(err)
	}
}
