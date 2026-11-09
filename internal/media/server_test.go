package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/media/mediatest"
)

type fixedSession struct {
	mu sync.Mutex
	r  Route
	ok bool
}

func (f *fixedSession) Route() (Route, bool) { f.mu.Lock(); defer f.mu.Unlock(); return f.r, f.ok }
func (f *fixedSession) set(r Route)          { f.mu.Lock(); f.r = r; f.mu.Unlock() }

func streamClient() *http.Client {
	return &http.Client{Transport: &http.Transport{DisableCompression: true}}
}

type rig struct {
	be     *mediatest.FakeBackend
	beSrv  *httptest.Server
	sess   *fixedSession
	proxy  *Server
	events chan Event
}

func newRig(t *testing.T, size, rate int) *rig {
	t.Helper()
	data := make([]byte, size)
	rand.Read(data)
	be := &mediatest.FakeBackend{Token: "tok", Tracks: map[string][]byte{"t1": data}, ContentType: "audio/mpeg", BytesPerSec: rate}
	beSrv := httptest.NewServer(be)
	sess := &fixedSession{r: Route{BaseURL: beSrv.URL, Token: "tok", Client: streamClient()}, ok: true}
	p := New(sess, 256<<20)
	ev := make(chan Event, 256)
	p.onEvent = func(e Event) { ev <- e }
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { p.Close(); beSrv.Close() })
	return &rig{be, beSrv, sess, p, ev}
}

func (r *rig) waitEvent(t *testing.T, mode string) Event {
	t.Helper()
	timeout := time.After(20 * time.Second)
	for {
		select {
		case e := <-r.events:
			if e.Mode == mode {
				return e
			}
		case <-timeout:
			t.Fatalf("no %s event", mode)
		}
	}
}

func get(t *testing.T, url, rng string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	if rng != "" {
		req.Header.Set("Range", rng)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func readAll(t *testing.T, url, rng string) (*http.Response, []byte) {
	res := get(t, url, rng)
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	return res, b
}

// Range answered from the shared download, with the headers <audio> needs.
func TestRangeFromSharedDownload(t *testing.T) {
	r := newRig(t, 2<<20, 0)
	res, body := readAll(t, r.proxy.URL("/track/t1"), "bytes=1000-1999")
	if res.StatusCode != 206 || res.Header.Get("Content-Range") != "bytes 1000-1999/2097152" {
		t.Fatalf("status %d range %q", res.StatusCode, res.Header.Get("Content-Range"))
	}
	if !bytes.Equal(body, r.be.Tracks["t1"][1000:2000]) {
		t.Fatal("body mismatch")
	}
	if res.Header.Get("Access-Control-Allow-Origin") != "*" || res.Header.Get("Content-Type") != "audio/mpeg" || res.Header.Get("Accept-Ranges") != "bytes" {
		t.Fatalf("headers %v", res.Header)
	}
	if log := r.be.Log(); len(log) != 1 || !strings.Contains(log[0], "range= ") {
		t.Fatalf("backend saw %v", log)
	}
}

// Chromium cancels the bytes=0- request on every seek; the download must still finish into the cache.
func TestDownloadOutlivesClient(t *testing.T) {
	const size = 3 << 20
	r := newRig(t, size, 4<<20)
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", r.proxy.URL("/track/t1"), nil)
	req.Header.Set("Range", "bytes=0-")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	io.ReadFull(res.Body, make([]byte, 64<<10))
	cancel()
	res.Body.Close()

	if e := r.waitEvent(t, "download"); e.Drained != size {
		t.Fatalf("download event %+v", e)
	}
	before := len(r.be.Log())
	res, body := readAll(t, r.proxy.URL("/track/t1"), "bytes=100-")
	if res.StatusCode != 206 || !bytes.Equal(body, r.be.Tracks["t1"][100:]) {
		t.Fatalf("cache serve status %d len %d", res.StatusCode, len(body))
	}
	if len(r.be.Log()) != before {
		t.Fatal("cache hit still went to the backend")
	}
}

// Chromium stops reading a media connection once its buffer is full, without closing it.
// The cache fill must not depend on that connection draining.
func TestPausedClientDoesNotStallFill(t *testing.T) {
	const size = 6 << 20
	r := newRig(t, size, 0)
	req, _ := http.NewRequest("GET", r.proxy.URL("/track/t1"), nil)
	req.Header.Set("Range", "bytes=0-")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	io.ReadFull(res.Body, make([]byte, 64<<10)) // then stop reading, keep the connection
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if r.proxy.cache.Len() == 1 {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("cache still empty after 3 s with a paused client; backend sent %d of %d bytes", r.be.Sent.Load(), size)
}

// A seek past the downloaded bytes is forwarded upstream; aborting it cancels that upstream.
func TestSeekAheadForwardedAndCancellable(t *testing.T) {
	r := newRig(t, 8<<20, 1<<20)
	first := get(t, r.proxy.URL("/track/t1"), "bytes=0-")
	defer first.Body.Close()
	io.ReadFull(first.Body, make([]byte, 32<<10))

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", r.proxy.URL("/track/t1"), nil)
	req.Header.Set("Range", "bytes=6000000-")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 206 || res.Header.Get("Content-Range") != "bytes 6000000-8388607/8388608" {
		t.Fatalf("%d %q", res.StatusCode, res.Header.Get("Content-Range"))
	}
	chunk := make([]byte, 32<<10)
	io.ReadFull(res.Body, chunk)
	if !bytes.Equal(chunk, r.be.Tracks["t1"][6000000:6000000+len(chunk)]) {
		t.Fatal("forwarded bytes differ")
	}
	cancel()
	res.Body.Close()
	e := r.waitEvent(t, "forward")
	if !e.UpstreamCancelled || e.Upstream != 206 {
		t.Fatalf("%+v", e)
	}
}

// A seek inside what has already arrived is served locally, without a new upstream request.
func TestSeekBehindServedLocally(t *testing.T) {
	r := newRig(t, 4<<20, 0)
	_, _ = readAll(t, r.proxy.URL("/track/t1"), "bytes=0-1")
	r.waitEvent(t, "download")
	r.proxy.cache.Clear() // force the in-flight path on a fresh download
	slow := newRig(t, 4<<20, 2<<20)
	first := get(t, slow.proxy.URL("/track/t1"), "bytes=0-")
	defer first.Body.Close()
	io.ReadFull(first.Body, make([]byte, 64<<10))
	time.Sleep(600 * time.Millisecond) // ~1.2 MB downloaded
	res, body := readAll(t, slow.proxy.URL("/track/t1"), "bytes=500000-500999")
	if res.StatusCode != 206 || !bytes.Equal(body, slow.be.Tracks["t1"][500000:501000]) {
		t.Fatal("local seek wrong")
	}
	if e := slow.waitEvent(t, "shared"); e.Range != "bytes=0-" && e.Range != "bytes=500000-500999" {
		t.Fatal(e)
	}
	if n := len(slow.be.Log()); n != 1 {
		t.Fatalf("backend saw %d requests: %v", n, slow.be.Log())
	}
}

// /head joins the element's download, or starts the shared one itself; never a second request.
func TestHeadSharesDownload(t *testing.T) {
	for _, headFirst := range []bool{true, false} {
		r := newRig(t, 4<<20, 8<<20)
		var wg sync.WaitGroup
		wg.Add(1)
		var head []byte
		var headTook time.Duration
		go func() {
			defer wg.Done()
			if !headFirst {
				time.Sleep(50 * time.Millisecond)
			}
			t0 := time.Now()
			_, head = readAll(t, r.proxy.URL("/track/t1/head"), "")
			headTook = time.Since(t0)
		}()
		if headFirst {
			time.Sleep(50 * time.Millisecond)
		}
		res := get(t, r.proxy.URL("/track/t1"), "bytes=0-")
		io.Copy(io.Discard, res.Body)
		res.Body.Close()
		wg.Wait()
		if !bytes.Equal(head, r.be.Tracks["t1"][:HeadBytes]) {
			t.Fatalf("head len %d", len(head))
		}
		if n := len(r.be.Log()); n != 1 {
			t.Fatalf("headFirst=%v: backend saw %d requests: %v", headFirst, n, r.be.Log())
		}
		t.Logf("headFirst=%v: head in %v, one backend request", headFirst, headTook.Round(time.Millisecond))
	}
}

// http.ServeContent answers every Range form TrackCache.ts hand-parses.
func TestCacheRanges(t *testing.T) {
	r := newRig(t, 1<<20, 0)
	readAll(t, r.proxy.URL("/track/t1"), "")
	r.waitEvent(t, "download")
	data := r.be.Tracks["t1"]
	cases := []struct {
		rng    string
		status int
		want   []byte
	}{
		{"", 200, data},
		{"bytes=0-", 206, data},
		{"bytes=-500", 206, data[len(data)-500:]},
		{"bytes=10-19", 206, data[10:20]},
		{"bytes=2000000-", 416, nil},
		{"bytes=0-0,5-5", 206, nil}, // multipart/byteranges
	}
	for _, c := range cases {
		res, b := readAll(t, r.proxy.URL("/track/t1"), c.rng)
		if res.StatusCode != c.status || (c.want != nil && !bytes.Equal(b, c.want)) {
			t.Errorf("%q: status %d len %d", c.rng, res.StatusCode, len(b))
		}
		if c.rng == "bytes=0-0,5-5" && !strings.HasPrefix(res.Header.Get("Content-Type"), "multipart/byteranges") {
			t.Errorf("multi-range content-type %q", res.Header.Get("Content-Type"))
		}
	}
}

// A session change cancels the in-flight download and clears the cache.
func TestSessionChangeStopsDownload(t *testing.T) {
	r := newRig(t, 8<<20, 1<<20)
	res := get(t, r.proxy.URL("/track/t1"), "bytes=0-")
	io.ReadFull(res.Body, make([]byte, 32<<10))
	r.sess.set(Route{BaseURL: r.beSrv.URL, Token: "tok2", Client: streamClient()})
	res2 := get(t, r.proxy.URL("/track/t1/head"), "") // any request syncs auth
	res2.Body.Close()
	res.Body.Close()
	e := r.waitEvent(t, "download")
	if !e.UpstreamCancelled || e.Drained == 8<<20 {
		t.Fatalf("%+v", e)
	}
	if r.proxy.cache.Len() != 0 {
		t.Fatal("cache kept a track from the old session")
	}
}

// A whole-file response without Content-Length can't be shared or cached: every request
// is answered on its own (seeks included) instead, with the bytes intact.
func TestNoContentLengthFallsBackToForwarding(t *testing.T) {
	r := newRig(t, 1<<20, 0)
	r.be.Chunked = true
	res, body := readAll(t, r.proxy.URL("/track/t1"), "")
	if res.StatusCode != 200 || !bytes.Equal(body, r.be.Tracks["t1"]) {
		t.Fatalf("whole file: status %d, %d bytes", res.StatusCode, len(body))
	}
	r.waitEvent(t, "forward")
	res, body = readAll(t, r.proxy.URL("/track/t1"), "bytes=500000-")
	if res.StatusCode != 206 || !bytes.Equal(body, r.be.Tracks["t1"][500000:]) {
		t.Fatalf("seek: status %d, %d bytes", res.StatusCode, len(body))
	}
	r.waitEvent(t, "forward")
	if _, ok := r.proxy.cache.Get("t1"); ok {
		t.Fatal("cached without a length")
	}
	t.Logf("backend requests: %v", r.be.Log())
}

// A 401 on the stream path expires the session it was served under, once.
func TestUnauthorizedExpiresRoute(t *testing.T) {
	r := newRig(t, 1<<20, 0)
	expired := make(chan struct{}, 4)
	r.sess.set(Route{BaseURL: r.beSrv.URL, Token: "stale", Client: streamClient(), Expire: func() { expired <- struct{}{} }})
	res, _ := readAll(t, r.proxy.URL("/track/t1"), "")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d", res.StatusCode)
	}
	select {
	case <-expired:
	case <-time.After(5 * time.Second):
		t.Fatal("route not expired")
	}
}

// Images pass through with their validators; only a pinned version may be cached.
func TestImageRoute(t *testing.T) {
	img := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Header.Get("Authorization") != "tok" || req.URL.Path != "/artist/7/image" {
			http.NotFound(w, req)
			return
		}
		w.Header().Set("ETag", `"h"`)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		if req.Header.Get("If-None-Match") == `"h"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("png"))
	}))
	defer img.Close()
	r := newRig(t, 1, 0)
	r.sess.set(Route{BaseURL: img.URL, Token: "tok", Client: streamClient()})

	res, body := readAll(t, r.proxy.ArtistImageURL(7, "h"), "")
	if res.StatusCode != 200 || string(body) != "png" || res.Header.Get("ETag") != `"h"` || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("%d %q %v", res.StatusCode, body, res.Header)
	}
	if res, _ := readAll(t, r.proxy.ArtistImageURL(7, ""), ""); res.Header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("unversioned cache-control %q", res.Header.Get("Cache-Control"))
	}
	req, _ := http.NewRequest("GET", r.proxy.ArtistImageURL(7, "h"), nil)
	req.Header.Set("If-None-Match", `"h"`)
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != http.StatusNotModified {
		t.Fatalf("revalidation: %v %v", res, err)
	}
	res.Body.Close()
}

// Saving to disk reads the shared download while playback joins it: one backend fetch,
// and a second save is served from the cache.
func TestReaderSharesDownload(t *testing.T) {
	r := newRig(t, 3<<20, 4<<20)
	want := r.be.Tracks["t1"]
	rd, err := r.proxy.Reader(context.Background(), "t1")
	if err != nil {
		t.Fatal(err)
	}
	if _, body := readAll(t, r.proxy.TrackURL("t1"), ""); !bytes.Equal(body, want) {
		t.Fatal("playback got different bytes")
	}
	got, err := io.ReadAll(rd)
	rd.Close()
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("reader: %v, %d bytes", err, len(got))
	}
	r.waitEvent(t, "download")
	rd, _ = r.proxy.Reader(context.Background(), "t1")
	if got, _ := io.ReadAll(rd); !bytes.Equal(got, want) || len(r.be.Log()) != 1 {
		t.Fatalf("cached read: %d bytes, backend log %v", len(got), r.be.Log())
	}
	if _, err := r.proxy.Reader(context.Background(), "missing"); err == nil || !strings.Contains(err.Error(), "refused the download (404)") {
		t.Fatalf("missing track: %v", err)
	}
}

type covers map[string][]byte

func (c covers) Cover(id string) ([]byte, bool) { b, ok := c[id]; return b, ok }

func TestStagedCoverRoute(t *testing.T) {
	r := newRig(t, 1, 0)
	r.proxy.Staged = covers{"s1": []byte("\xff\xd8\xff\xe0jpeg")}
	if res, body := readAll(t, r.proxy.StagedCoverURL("s1"), ""); res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/jpeg" || len(body) != 8 {
		t.Fatalf("%d %v", res.StatusCode, res.Header)
	}
	if res, _ := readAll(t, r.proxy.StagedCoverURL("gone"), ""); res.StatusCode != 404 {
		t.Fatalf("discarded cover: %d", res.StatusCode)
	}
}
