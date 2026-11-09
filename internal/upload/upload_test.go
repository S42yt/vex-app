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
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/backend"
	"github.com/VexWave/vex-app/internal/backend/contracttest"
	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/session"
)

func writeRandom(t *testing.T, name string, size int64) (string, [32]byte) {
	path := filepath.Join(t.TempDir(), name)
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	h := sha256.New()
	io.CopyN(io.MultiWriter(f, h), rand.Reader, size)
	f.Close()
	var sum [32]byte
	copy(sum[:], h.Sum(nil))
	return path, sum
}

type posted struct {
	Title     string  `json:"title"`
	Duration  int     `json:"duration"`
	ArtistIDs []int32 `json:"artistIds"`
	Cover     []byte  `json:"cover"`
	Data      []byte  `json:"data"`
}

// A track at the contract maximum streams through with an exact Content-Length, decodes to
// identical bytes, and allocates far less than its size.
func TestStreamedUploadMaxSize(t *testing.T) {
	path, want := writeRandom(t, "track.mp3", MaxAudioBytes)
	spool := filepath.Join(t.TempDir(), "body.json")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/postTrack" || r.Header.Get("Authorization") != "tok" {
			http.Error(w, "wrong route", 400)
			return
		}
		f, _ := os.Create(spool)
		n, _ := io.Copy(f, r.Body)
		f.Close()
		if n != r.ContentLength {
			http.Error(w, "short body", 400)
		}
	}))
	defer srv.Close()

	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	b, stop, err := body(meta{Title: "Ünïcode \"quoted\" title", Duration: 215000, ArtistIDs: []int32{3, 9}, Cover: "AQID"}, f)
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	c := &backend.Client{BaseURL: srv.URL, Token: "tok", HTTP: http.DefaultClient}
	if err := c.PostTrack(context.Background(), b); err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	if alloc := after.TotalAlloc - before.TotalAlloc; alloc > 8<<20 {
		t.Fatalf("upload allocated %d bytes", alloc)
	}

	raw, _ := os.ReadFile(spool)
	var got posted
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if sha256.Sum256(got.Data) != want || got.Title != "Ünïcode \"quoted\" title" || got.Duration != 215000 || len(got.ArtistIDs) != 2 || string(got.Cover) != "\x01\x02\x03" {
		t.Fatalf("decoded body mismatch: %q %d %v", got.Title, got.Duration, got.ArtistIDs)
	}
}

func TestTooLargeRefusedBeforeReading(t *testing.T) {
	path, _ := writeRandom(t, "big.mp3", MaxAudioBytes+1)
	u := &UploadService{Bin: t.TempDir()}
	got, err := u.Stage(context.Background(), []string{path}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "" || !strings.HasPrefix(got[0].Error, "That track is 75.0 MB") {
		t.Fatalf("%+v", got)
	}
}

// Confirmed uploads go out one at a time in confirm order, and each holds a Transfer token
// from the moment it is queued.
func TestConfirmQueue(t *testing.T) {
	var mu sync.Mutex
	var order []string
	gate := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var p posted
		json.NewDecoder(r.Body).Decode(&p)
		mu.Lock()
		order = append(order, p.Title)
		first := len(order) == 1
		mu.Unlock()
		if first {
			<-gate
		}
	}))
	defer srv.Close()
	store := &session.Store{}
	store.Restore(session.Session{BaseURL: srv.URL, Token: "tok"})
	reg := &busy.Registry{}
	u := &UploadService{Busy: reg, Store: store, staged: map[string]*entry{}}
	titles := []string{"one", "two", "three"}
	paths := map[string]string{}
	for _, title := range titles {
		path, _ := writeRandom(t, title+".mp3", 1000)
		paths[title] = path
		u.staged[title] = &entry{path: path, durationMs: 1000, owned: title == "one"}
	}

	errs := make(chan error, len(titles))
	for i, title := range titles {
		go func() { errs <- u.Confirm(context.Background(), ConfirmParams{StagedID: title, Title: title}) }()
		for deadline := time.Now().Add(5 * time.Second); reg.Held(busy.Transfer) != i+1; time.Sleep(time.Millisecond) {
			if time.Now().After(deadline) {
				t.Fatalf("%s never queued", title)
			}
		}
	}
	close(gate)
	for range titles {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	if strings.Join(order, ",") != "one,two,three" || reg.Held(busy.Transfer) != 0 {
		t.Fatalf("order %v, held %d", order, reg.Held(busy.Transfer))
	}
	if _, err := os.Stat(paths["one"]); err == nil {
		t.Fatal("an import's file outlived its upload")
	}
	if _, err := os.Stat(paths["two"]); err != nil {
		t.Fatal("a picked file was deleted")
	}
	if err := u.Confirm(context.Background(), ConfirmParams{StagedID: "one"}); err == nil {
		t.Fatal("a staged file uploaded twice")
	}
}

func TestClampTitle(t *testing.T) {
	long := strings.Repeat("a", backend.MaxNameLength-1) + "😀"
	for in, want := range map[string]string{
		"  x  ": "x",
		"   ":   "Untitled",
		long:    strings.Repeat("a", backend.MaxNameLength-1),
	} {
		if got := clampTitle(in); got != want {
			t.Errorf("clampTitle(%.20q) = %.20q", in, got)
		}
	}
}

// The streamed upload body parses under the contract with no field ignored.
func TestPostTrackContract(t *testing.T) {
	path, _ := writeRandom(t, "track.mp3", 1000)
	rec := &contracttest.Recorder{}
	srv := httptest.NewServer(rec)
	defer srv.Close()
	c := &backend.Client{BaseURL: srv.URL, Token: "tok", HTTP: srv.Client()}
	for _, m := range []meta{
		{Title: "T"},
		{Title: "T", Duration: backend.MaxDurationMs, ArtistIDs: []int32{3, 9}, Cover: "AQID"},
	} {
		f, err := os.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		b, stop, err := body(m, f)
		if err == nil {
			err = c.PostTrack(context.Background(), b)
			stop()
		}
		f.Close()
		if err != nil {
			t.Fatal(err)
		}
	}
	contracttest.Check(t, rec.Seen())
}
