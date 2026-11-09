package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"time"
	"unsafe"

	"example.com/gotests/media"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
)

// ---- binding type-mapping probes ----

type Kind string

const (
	KindTrack  Kind = "track"
	KindArtist Kind = "artist"
)

// Nullable distinguishes absent (Set=false) from null (Null=true) on unmarshal.
type Nullable[T any] struct {
	Set, Null bool
	V         T
}

func (n *Nullable[T]) UnmarshalJSON(b []byte) error {
	n.Set = true
	if string(b) == "null" {
		n.Null = true
		return nil
	}
	return json.Unmarshal(b, &n.V)
}

func (n Nullable[T]) MarshalJSON() ([]byte, error) {
	if n.Null || !n.Set {
		return []byte("null"), nil
	}
	return json.Marshal(n.V)
}

func (n Nullable[T]) IsZero() bool { return !n.Set }

type RemoteTrack struct {
	ID        string         `json:"id"`
	Title     string         `json:"title"`
	CoverURL  *string        `json:"coverUrl"`
	ImageURL  string         `json:"imageUrl,omitempty"`
	Duration  *int           `json:"duration,omitempty"`
	ArtistIDs []int32        `json:"artistIds"`
	Raw       []byte         `json:"raw"`
	Kind      Kind           `json:"kind"`
	Extra     map[string]int `json:"extra"`
	Created   time.Time      `json:"created"`
}

type EditTrackParams struct {
	ID          string           `json:"id"`
	Title       *string          `json:"title,omitempty"`
	CoverBase64 Nullable[string] `json:"coverBase64,omitzero"`
}

type EditEcho struct {
	CoverSet, CoverNull bool
	Cover               string
	Forwarded           string
}

type Failure struct {
	Status        int    `json:"status,omitempty"`
	RetryAfterSec int    `json:"retryAfterSec,omitempty"`
	Message       string `json:"error"`
}

func (f *Failure) Error() string { return f.Message }

type BinaryProgress struct {
	Binary   string  `json:"binary"`
	Fraction float64 `json:"fraction"`
}

type BinaryFailed struct {
	Binary string `json:"binary"`
	Error  string `json:"error"`
}

func init() {
	application.RegisterEvent[BinaryProgress]("binaries:progress")
	application.RegisterEvent[BinaryFailed]("binaries:failed")
	application.RegisterEvent[string]("time")
}

// ---- the probe service ----

type ProbeService struct {
	app *application.App

	mu        sync.Mutex
	events    []media.Event
	cancelled []string
	be        *media.FakeBackend
	beSrv     *httptest.Server
	proxy     *media.Server
}

type session struct{ r media.Route }

func (s session) Route() (media.Route, bool) { return s.r, true }

func (p *ProbeService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	stream, err := os.ReadFile(os.Getenv("PROBE_FIXTURES") + `\stream.mp3`)
	if err != nil {
		return err
	}
	tagged, _ := os.ReadFile(os.Getenv("PROBE_FIXTURES") + `\tagged.mp3`)
	p.be = &media.FakeBackend{Token: "tok", Tracks: map[string][]byte{"t1": stream, "t2": tagged, "t3": stream}, ContentType: "audio/mpeg", BytesPerSec: 512 << 10}
	p.beSrv = httptest.NewServer(p.be)
	p.proxy = media.New(session{media.Route{BaseURL: p.beSrv.URL, Token: "tok"}}, &http.Client{Transport: &http.Transport{DisableCompression: true}}, 256<<20)
	p.proxy.OnEvent = func(e media.Event) { p.mu.Lock(); p.events = append(p.events, e); p.mu.Unlock() }
	return p.proxy.Start()
}

type MediaInfo struct {
	Track1, Head1, Track2, Track3 string
	Size1                         int
}

func (p *ProbeService) Media() MediaInfo {
	return MediaInfo{p.proxy.URL("/track/t1"), p.proxy.URL("/track/t1/head"), p.proxy.URL("/track/t2"), p.proxy.URL("/track/t3"), len(p.be.Tracks["t1"])}
}

func (p *ProbeService) MediaEvents() []media.Event {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]media.Event(nil), p.events...)
}

func (p *ProbeService) BackendLog() []string { return p.be.Log() }
func (p *ProbeService) BackendSent() int64   { return p.be.Sent.Load() }

func (p *ProbeService) Echo(s string) int      { return len(s) }
func (p *ProbeService) EchoBytes(b []byte) int { return len(b) }
func (p *ProbeService) Big(n int) string       { return string(bytes.Repeat([]byte("x"), n)) }

type Span struct{ Start, End int64 }

func (p *ProbeService) Sleep(ms int) Span {
	s := time.Now().UnixMilli()
	time.Sleep(time.Duration(ms) * time.Millisecond)
	return Span{s, time.Now().UnixMilli()}
}

// Wait blocks until the call context ends, and records why.
func (p *ProbeService) Wait(ctx context.Context, tag string) (string, error) {
	select {
	case <-ctx.Done():
		p.mu.Lock()
		p.cancelled = append(p.cancelled, tag+": "+ctx.Err().Error())
		p.mu.Unlock()
		return "", ctx.Err()
	case <-time.After(10 * time.Second):
		return "timeout", nil
	}
}

func (p *ProbeService) Cancelled() []string { p.mu.Lock(); defer p.mu.Unlock(); return p.cancelled }

func (p *ProbeService) Fail(status int) (*RemoteTrack, error) {
	if status == 0 {
		return nil, errors.New("plain error")
	}
	return nil, &Failure{Status: status, RetryAfterSec: 30, Message: "Too many requests"}
}

func (p *ProbeService) Track() RemoteTrack {
	u := "http://x/cover"
	return RemoteTrack{ID: "1", Title: "t", CoverURL: &u, Raw: []byte{1, 2, 3}, Kind: KindTrack}
}

func (p *ProbeService) EditTrack(params EditTrackParams) EditEcho {
	out, _ := json.Marshal(params)
	return EditEcho{params.CoverBase64.Set, params.CoverBase64.Null, params.CoverBase64.V, string(out)}
}

func (p *ProbeService) EmitProgress() {
	p.app.Event.Emit("binaries:progress", BinaryProgress{"ytDlp", 0.5})
	p.app.Event.Emit("binaries:failed", BinaryFailed{"ffmpeg", "boom"})
}

type JobInfo struct {
	InJob       bool
	KillOnClose bool
	BreakawayOK bool
	Err         string
}

func (p *ProbeService) Job() JobInfo { return jobInfo() }

func jobInfo() JobInfo {
	var in int32
	if r, _, err := procIsProcessInJob.Call(uintptr(windows.CurrentProcess()), 0, uintptr(unsafe.Pointer(&in))); r == 0 {
		return JobInfo{Err: err.Error()}
	}
	ji := JobInfo{InJob: in != 0}
	if in != 0 {
		var info windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
		err := windows.QueryInformationJobObject(0, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)), nil)
		if err != nil {
			ji.Err = err.Error()
		}
		f := info.BasicLimitInformation.LimitFlags
		ji.KillOnClose = f&windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE != 0
		ji.BreakawayOK = f&(windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK|windows.JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK) != 0
	}
	return ji
}

func (p *ProbeService) Quit() { go func() { time.Sleep(200 * time.Millisecond); p.app.Quit() }() }

// ---- asset-server streaming probe ----

// SlowRoute writes a chunk, flushes, waits, then writes the rest.
type SlowRoute struct{}

func (*SlowRoute) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte("first chunk\n"))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	time.Sleep(3 * time.Second)
	w.Write([]byte("second chunk\n"))
}

var procIsProcessInJob = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob")
