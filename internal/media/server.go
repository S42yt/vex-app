// Package media is the loopback server the webview loads audio and images from.
//
// One shared download per track: a goroutine owned by the server (not by any
// request) fills a buffer; every request for that track, /head included, reads
// from it through http.ServeContent at its own pace. A request far ahead of the
// download is forwarded upstream as a Range request instead of waiting.
package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/VexWave/vex-app/internal/backend"
)

const (
	HeadBytes = 1_500_000
	// A request starting this far past the downloaded bytes is forwarded upstream.
	seekAheadSlack = 1 << 20
)

// Route is the session a request is served under.
type Route struct {
	BaseURL, Token string
	// Client is the stream client: no gzip, so the whole-file response keeps its Content-Length.
	Client *http.Client
	// Expire ends this session after a 401; a newer session survives it.
	Expire func()
}

type Session interface{ Route() (Route, bool) }

// Covers hands out the cover extracted when a local file was staged for upload.
type Covers interface {
	Cover(id string) ([]byte, bool)
}

// Event records how one request or download went; tests read it through onEvent.
type Event struct {
	Path, Range       string
	Upstream          int
	Mode              string // cache | shared | forward | head-cache | head-shared | download
	ToClient, Drained int64
	ClientGone        bool
	UpstreamCancelled bool
	Duration          time.Duration
}

type Server struct {
	secret  string
	session Session
	// Staged serves /staged/<id>/cover; set before Start.
	Staged  Covers
	cache   *Cache
	onEvent func(Event)

	mu        sync.Mutex
	downloads map[string]*download
	authKey   string
	authCtx   context.Context
	authStop  context.CancelFunc

	ln  net.Listener
	srv *http.Server
}

func New(session Session, cacheBytes int64) *Server {
	b := make([]byte, 16)
	rand.Read(b)
	ctx, cancel := context.WithCancel(context.Background())
	return &Server{
		secret: hex.EncodeToString(b), session: session,
		cache: NewCache(cacheBytes), downloads: map[string]*download{},
		authCtx: ctx, authStop: cancel,
	}
}

func (s *Server) Start() error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	s.ln = ln
	// No WriteTimeout: Chromium leaves paused media connections idle for minutes.
	s.srv = &http.Server{Handler: s, ReadHeaderTimeout: 10 * time.Second}
	go s.srv.Serve(ln)
	return nil
}

func (s *Server) Close() error { s.authStop(); return s.srv.Close() }

func (s *Server) URL(path string) string {
	return fmt.Sprintf("http://%s/%s%s", s.ln.Addr(), s.secret, path)
}

func (s *Server) TrackURL(id string) string { return s.URL("/track/" + id) }

func (s *Server) TrackImageURL(id, version string) string {
	return s.URL(backend.TrackImagePath(id, version))
}

func (s *Server) ArtistImageURL(id int32, version string) string {
	return s.URL(backend.ArtistImagePath(id, version))
}

func (s *Server) PlaylistImageURL(id int32, version string) string {
	return s.URL(backend.PlaylistImagePath(id, version))
}

func (s *Server) StagedCoverURL(id string) string { return s.URL("/staged/" + id + "/cover") }

func (s *Server) Evict(id string) { s.cache.Delete(id) }

// Reader returns a track's bytes from the cache or the shared download, or else straight
// from the backend. Reads end with ctx.
func (s *Server) Reader(ctx context.Context, id string) (io.ReadCloser, error) {
	route, ok := s.session.Route()
	if !ok {
		return nil, backend.ErrNotLoggedIn
	}
	s.syncAuth(route)
	if e, ok := s.cache.Get(id); ok {
		return io.NopCloser(bytes.NewReader(e.Bytes)), nil
	}
	d := s.join(id, route)
	select {
	case <-d.ready:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if d.err == nil || d.total > 0 {
		return io.NopCloser(io.NewSectionReader(d.reader(ctx), 0, d.total)), nil
	}
	res, err := s.upstream(ctx, route, id, "")
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		res.Body.Close()
		return nil, &backend.Failure{Status: res.StatusCode, Message: fmt.Sprintf("The server refused the download (%d).", res.StatusCode)}
	}
	return res.Body, nil
}

var (
	reTrack = regexp.MustCompile(`^/([^/]+)/track/([^/]+)$`)
	reHead  = regexp.MustCompile(`^/([^/]+)/track/([^/]+)/head$`)
	reImage = regexp.MustCompile(`^/([^/]+)/(track|artist|playlist)/([^/]+)/image$`)
	reCover = regexp.MustCompile(`^/([^/]+)/staged/([^/]+)/cover$`)
)

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == http.MethodOptions {
		h := w.Header()
		h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "range")
		h.Set("Access-Control-Max-Age", "86400")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if m := reImage.FindStringSubmatch(r.URL.Path); m != nil && m[1] == s.secret {
		s.serveImage(w, r, m[2], m[3])
		return
	}
	if m := reCover.FindStringSubmatch(r.URL.Path); m != nil && m[1] == s.secret && s.Staged != nil {
		if b, ok := s.Staged.Cover(m[2]); ok {
			http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(b))
			return
		}
	}
	var m []string
	isHead := false
	if m = reHead.FindStringSubmatch(r.URL.Path); m != nil {
		isHead = true
	} else if m = reTrack.FindStringSubmatch(r.URL.Path); m == nil {
		http.NotFound(w, r)
		return
	}
	if m[1] != s.secret {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	route, ok := s.session.Route()
	if !ok {
		http.Error(w, "not logged in", http.StatusUnauthorized)
		return
	}
	s.syncAuth(route)
	id := m[2]
	start := time.Now()
	ev := Event{Path: r.URL.Path, Range: r.Header.Get("Range")}
	defer func() { ev.Duration = time.Since(start); ev.ClientGone = r.Context().Err() != nil; s.emit(ev) }()

	if e, ok := s.cache.Get(id); ok {
		w.Header().Set("Content-Type", e.ContentType)
		if isHead {
			ev.Mode = "head-cache"
			w.Write(e.Bytes[:min(len(e.Bytes), HeadBytes)])
			return
		}
		ev.Mode = "cache"
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(e.Bytes))
		return
	}

	d := s.join(id, route)
	select {
	case <-d.ready:
	case <-r.Context().Done():
		return
	}
	if d.err != nil && d.total == 0 {
		// The download never got a usable response: answer this request on its own.
		ev.Mode = "forward"
		s.forward(w, r, route, id, &ev)
		return
	}
	w.Header().Set("Content-Type", d.contentType)
	if isHead {
		ev.Mode = "head-shared"
		n, _ := io.Copy(w, io.NewSectionReader(d.reader(r.Context()), 0, min(int64(HeadBytes), d.total)))
		ev.ToClient = n
		return
	}
	if off, ok := rangeStart(r.Header.Get("Range")); ok && off > d.available()+seekAheadSlack {
		ev.Mode = "forward"
		s.forward(w, r, route, id, &ev)
		return
	}
	ev.Mode = "shared"
	cw := &countingWriter{ResponseWriter: w}
	http.ServeContent(cw, r, "", time.Time{}, d.reader(r.Context()))
	ev.ToClient = cw.n
}

func (s *Server) emit(e Event) {
	if s.onEvent != nil {
		s.onEvent(e)
	}
}

func (s *Server) syncAuth(r Route) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := r.BaseURL + "\n" + r.Token
	if key != s.authKey {
		s.cache.Clear()
		s.authStop()
		clear(s.downloads)
		s.authCtx, s.authStop = context.WithCancel(context.Background())
		s.authKey = key
	}
}

// join returns the track's in-flight download, starting one if there is none.
func (s *Server) join(id string, route Route) *download {
	s.mu.Lock()
	defer s.mu.Unlock()
	if d, ok := s.downloads[id]; ok {
		return d
	}
	d := &download{ready: make(chan struct{}), changed: make(chan struct{})}
	s.downloads[id] = d
	go s.fetch(s.authCtx, id, route, d)
	return d
}

func (s *Server) fetch(ctx context.Context, id string, route Route, d *download) {
	start := time.Now()
	ev := Event{Path: "/track/" + id, Mode: "download"}
	defer func() {
		s.mu.Lock()
		if s.downloads[id] == d {
			delete(s.downloads, id)
		}
		s.mu.Unlock()
		ev.UpstreamCancelled = ctx.Err() != nil
		ev.Duration = time.Since(start)
		s.emit(ev)
	}()
	res, err := s.upstream(ctx, route, id, "")
	if err != nil {
		d.fail(err)
		return
	}
	defer res.Body.Close()
	ev.Upstream = res.StatusCode
	if res.StatusCode != http.StatusOK || res.ContentLength <= 0 || !s.cache.Fits(res.ContentLength) {
		d.fail(fmt.Errorf("not cacheable: %s, length %d", res.Status, res.ContentLength))
		return
	}
	d.start(res.ContentLength, contentTypeOf(res))
	buf := make([]byte, 64<<10)
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			d.append(buf[:n])
			ev.Drained += int64(n)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			d.fail(rerr)
			return
		}
	}
	if data, ok := d.complete(); ok && ctx.Err() == nil {
		s.cache.Set(id, Entry{Bytes: data, ContentType: d.contentType})
	}
}

func (s *Server) upstream(ctx context.Context, route Route, id, rng string) (*http.Response, error) {
	h := http.Header{}
	if rng != "" {
		h.Set("Range", rng)
	}
	res, err := fetch(ctx, route, backend.TrackAudioPath(id), h)
	if err == nil && res.StatusCode == http.StatusUnauthorized && route.Expire != nil {
		route.Expire()
	}
	return res, err
}

func fetch(ctx context.Context, route Route, path string, h http.Header) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, route.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header = h
	req.Header.Set("Authorization", route.Token)
	return route.Client.Do(req)
}

var imageHeaders = []string{"Content-Type", "Content-Range", "Accept-Ranges", "ETag"}

// serveImage forwards an image; only a URL that pins a content hash may be cached for good.
func (s *Server) serveImage(w http.ResponseWriter, r *http.Request, kind, id string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	route, ok := s.session.Route()
	if !ok {
		http.Error(w, "not logged in", http.StatusUnauthorized)
		return
	}
	version := r.URL.Query().Get("v")
	var path string
	if kind == "track" {
		path = backend.TrackImagePath(id, version)
	} else {
		n, err := strconv.ParseInt(id, 10, 32)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if kind == "artist" {
			path = backend.ArtistImagePath(int32(n), version)
		} else {
			path = backend.PlaylistImagePath(int32(n), version)
		}
	}
	h := http.Header{}
	if v := r.Header.Get("If-None-Match"); v != "" {
		h.Set("If-None-Match", v)
	}
	res, err := fetch(r.Context(), route, path, h)
	if err != nil {
		http.Error(w, "backend unreachable", http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	for _, k := range imageHeaders {
		if v := res.Header.Get(k); v != "" {
			w.Header().Set(k, v)
		}
	}
	if version == "" {
		w.Header().Set("Cache-Control", "no-cache")
	} else if v := res.Header.Get("Cache-Control"); v != "" {
		w.Header().Set("Cache-Control", v)
	}
	w.WriteHeader(res.StatusCode)
	if res.StatusCode != http.StatusNotModified {
		io.Copy(w, res.Body)
	}
}

var passthrough = []string{"Content-Type", "Content-Range", "Accept-Ranges"}

// forward answers one request with its own upstream Range request, cancelled with the client.
func (s *Server) forward(w http.ResponseWriter, r *http.Request, route Route, id string, ev *Event) {
	res, err := s.upstream(r.Context(), route, id, r.Header.Get("Range"))
	if err != nil {
		http.Error(w, "backend unreachable", http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	ev.Upstream = res.StatusCode
	for _, h := range passthrough {
		if v := res.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.WriteHeader(res.StatusCode)
	n, err := io.Copy(w, res.Body)
	ev.ToClient = n
	ev.UpstreamCancelled = err != nil && r.Context().Err() != nil
}

func contentTypeOf(res *http.Response) string {
	if ct := res.Header.Get("Content-Type"); ct != "" {
		return ct
	}
	return "application/octet-stream"
}

var reRangeStart = regexp.MustCompile(`^bytes=(\d+)-`)

func rangeStart(h string) (int64, bool) {
	m := reRangeStart.FindStringSubmatch(h)
	if m == nil {
		return 0, false
	}
	var n int64
	fmt.Sscan(m[1], &n)
	return n, true
}

type countingWriter struct {
	http.ResponseWriter
	n int64
}

func (c *countingWriter) Write(p []byte) (int, error) {
	n, err := c.ResponseWriter.Write(p)
	c.n += int64(n)
	return n, err
}

// download is a growing buffer with one writer (fetch) and any number of readers.
type download struct {
	ready     chan struct{} // closed once total/contentType are known, or on failure
	readyOnce sync.Once

	mu          sync.Mutex
	buf         []byte
	total       int64
	contentType string
	err         error
	changed     chan struct{} // closed and replaced on every append, completion or failure
}

var errFailed = errors.New("download failed")

func (d *download) start(total int64, ct string) {
	d.mu.Lock()
	d.buf, d.total, d.contentType = make([]byte, 0, total), total, ct
	d.mu.Unlock()
	d.readyOnce.Do(func() { close(d.ready) })
}

func (d *download) append(p []byte) {
	d.mu.Lock()
	if int64(len(d.buf)+len(p)) <= d.total {
		d.buf = append(d.buf, p...)
	}
	close(d.changed)
	d.changed = make(chan struct{})
	d.mu.Unlock()
}

func (d *download) fail(err error) {
	d.mu.Lock()
	d.err = err
	close(d.changed)
	d.changed = make(chan struct{})
	d.mu.Unlock()
	d.readyOnce.Do(func() { close(d.ready) })
}

func (d *download) complete() ([]byte, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.buf, int64(len(d.buf)) == d.total
}

func (d *download) available() int64 { d.mu.Lock(); defer d.mu.Unlock(); return int64(len(d.buf)) }

func (d *download) reader(ctx context.Context) *progressive {
	return &progressive{d: d, ctx: ctx}
}

// progressive is an io.ReadSeeker (and ReaderAt) over a download; reads block until the bytes arrive.
type progressive struct {
	d   *download
	ctx context.Context
	off int64
}

func (p *progressive) Seek(off int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		p.off = off
	case io.SeekCurrent:
		p.off += off
	case io.SeekEnd:
		p.off = p.d.total + off
	}
	return p.off, nil
}

func (p *progressive) Read(b []byte) (int, error) {
	n, err := p.ReadAt(b, p.off)
	p.off += int64(n)
	return n, err
}

func (p *progressive) ReadAt(b []byte, off int64) (int, error) {
	for {
		p.d.mu.Lock()
		have, total, err, changed := int64(len(p.d.buf)), p.d.total, p.d.err, p.d.changed
		if off >= total {
			p.d.mu.Unlock()
			return 0, io.EOF
		}
		if off < have {
			n := copy(b, p.d.buf[off:have])
			p.d.mu.Unlock()
			return n, nil
		}
		p.d.mu.Unlock()
		if err != nil {
			return 0, errFailed
		}
		select {
		case <-changed:
		case <-p.ctx.Done():
			return 0, p.ctx.Err()
		}
	}
}
