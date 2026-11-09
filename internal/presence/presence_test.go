package presence

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/Microsoft/go-winio"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// fakeDiscord serves Discord's IPC framing on a named pipe of its own.
type fakeDiscord struct {
	prefix string
	ln     net.Listener
	// refuse answers every SET_ACTIVITY with an ERROR, as Discord does with activity privacy on.
	refuse bool

	mu    sync.Mutex
	sends []sent
	conn  net.Conn
}

type sent struct {
	at    time.Time
	pid   float64
	act   map[string]any
	nonce string
}

func newFakeDiscord(t *testing.T, refuse bool) *fakeDiscord {
	d := &fakeDiscord{prefix: `\\.\pipe\vexwave-test-` + rand.Text() + `-`, refuse: refuse}
	d.listen(t)
	return d
}

// listen serves on index 3, so the client has to sweep past absent pipes to find it.
func (d *fakeDiscord) listen(t *testing.T) {
	ln, err := winio.ListenPipe(d.prefix+"3", nil)
	if err != nil {
		t.Fatal(err)
	}
	d.ln = ln
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			d.mu.Lock()
			d.conn = c
			d.mu.Unlock()
			go d.serve(c)
		}
	}()
}

func (d *fakeDiscord) serve(c net.Conn) {
	defer c.Close()
	for {
		var hdr [8]byte
		if _, err := io.ReadFull(c, hdr[:]); err != nil {
			return
		}
		body := make([]byte, binary.LittleEndian.Uint32(hdr[4:]))
		io.ReadFull(c, body)
		if binary.LittleEndian.Uint32(hdr[:]) == opHandshake {
			writeJSON(c, opFrame, map[string]any{"evt": "READY", "data": map[string]any{"user": map[string]any{"username": "u"}}})
			continue
		}
		var m struct {
			Nonce string `json:"nonce"`
			Args  struct {
				Pid      float64        `json:"pid"`
				Activity map[string]any `json:"activity"`
			} `json:"args"`
		}
		json.Unmarshal(body, &m)
		d.mu.Lock()
		d.sends = append(d.sends, sent{time.Now(), m.Args.Pid, m.Args.Activity, m.Nonce})
		d.mu.Unlock()
		reply := map[string]any{"cmd": "SET_ACTIVITY", "nonce": m.Nonce, "evt": nil}
		if d.refuse {
			reply = map[string]any{"cmd": "SET_ACTIVITY", "nonce": m.Nonce, "evt": "ERROR", "data": map[string]any{"code": 4000, "message": "privacy"}}
		}
		writeJSON(c, opFrame, reply)
	}
}

func (d *fakeDiscord) snapshot() []sent {
	d.mu.Lock()
	defer d.mu.Unlock()
	return append([]sent(nil), d.sends...)
}

// kick ends the client's connection, as quitting Discord does.
func (d *fakeDiscord) kick() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.conn.Close()
}

type statuses chan Status

func (s statuses) Emit(name string, data ...any) bool { s <- data[0].(Status); return true }

func (s statuses) wait(t *testing.T, connection string) Status {
	t.Helper()
	for {
		select {
		case st := <-s:
			if st.Connection == connection {
				return st
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("no %s status", connection)
		}
	}
}

var fast = timing{debounce: 20 * time.Millisecond, floor: 100 * time.Millisecond, reconnect: 50 * time.Millisecond, handshake: 500 * time.Millisecond}

func start(t *testing.T, d *fakeDiscord, baseURL string) (*PresenceService, statuses) {
	st := make(statuses, 64)
	p := &PresenceService{Events: st, BaseURL: func() string { return baseURL }, pipePrefix: d.prefix, timing: fast}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	p.ServiceStartup(ctx, application.ServiceOptions{})
	return p, st
}

func enable(t *testing.T, p *PresenceService, on bool) Status {
	t.Helper()
	s, err := p.SetEnabled(context.Background(), EnableParams{Enabled: on})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func play(p *PresenceService, tr *Track) {
	p.SetNowPlaying(context.Background(), NowPlaying{Track: tr})
}

// Bursts of track changes from many goroutines: sends stay at least the floor apart, and the
// last track wins. Every send also proves a write isn't stuck behind the pending read.
func TestDebounceFloorAndLastWins(t *testing.T) {
	d := newFakeDiscord(t, false)
	p, st := start(t, d, "https://music.example.com")
	enable(t, p, true)
	st.wait(t, "connected")

	var wg sync.WaitGroup
	for range 5 {
		for range 20 {
			wg.Add(1)
			go func() { defer wg.Done(); play(p, &Track{ID: "t", Title: "burst", PositionSec: 1}) }()
		}
		wg.Wait()
		time.Sleep(30 * time.Millisecond)
	}
	play(p, &Track{ID: "t1", Title: "final", Artist: "yo", HasCover: true, PositionSec: 10, DurationSec: 200})
	time.Sleep(fast.floor + 5*fast.debounce)

	s := d.snapshot()
	if len(s) == 0 || s[len(s)-1].act["details"] != "final" {
		t.Fatalf("last send %+v", s)
	}
	for i := 1; i < len(s); i++ {
		if gap := s[i].at.Sub(s[i-1].at); gap < fast.floor-5*time.Millisecond {
			t.Fatalf("sends %d and %d only %v apart", i-1, i, gap)
		}
	}
	last := s[len(s)-1]
	assets := last.act["assets"].(map[string]any)
	ts := last.act["timestamps"].(map[string]any)
	if assets["large_image"] != "https://music.example.com/track/t1/image" || assets["small_image"] != logoAsset ||
		last.act["state"] != "yo" || ts["end"].(float64)-ts["start"].(float64) != 200000 || last.pid == 0 {
		t.Fatalf("activity %+v pid %v", last.act, last.pid)
	}
}

func TestRefusalAndClear(t *testing.T) {
	d := newFakeDiscord(t, true)
	p, st := start(t, d, "http://192.168.1.5:8080")
	enable(t, p, true)
	st.wait(t, "connected")
	play(p, &Track{ID: "t", Title: "x", HasCover: true})
	if r := st.wait(t, "refused").Refusal; r.Code != 4000 || r.Message != "privacy" {
		t.Fatalf("%+v", r)
	}
	if a := d.snapshot()[0].act["assets"].(map[string]any); a["large_image"] != logoAsset {
		t.Fatalf("private server's cover sent to Discord: %v", a)
	}
	play(p, nil)
	time.Sleep(fast.floor + 3*fast.debounce)
	if s := d.snapshot(); s[len(s)-1].act != nil {
		t.Fatal("stopping playback didn't clear the card")
	}
}

func TestReconnectsAfterDiscordQuits(t *testing.T) {
	d := newFakeDiscord(t, false)
	p, st := start(t, d, "")
	if s := enable(t, p, true); s.Connection != "offline" {
		t.Fatal("connected before the handshake")
	}
	st.wait(t, "connected")
	d.kick()
	st.wait(t, "offline")
	st.wait(t, "connected")
	if s := enable(t, p, false); s.Connection != "offline" {
		t.Fatal("still connected after disable")
	}
	for i := range 50 { // concurrent toggles and track changes
		go p.SetEnabled(context.Background(), EnableParams{Enabled: i%2 == 0})
		go play(p, nil)
	}
	time.Sleep(100 * time.Millisecond)
}

func TestNoDiscord(t *testing.T) {
	p := &PresenceService{Events: make(statuses, 8), pipePrefix: `\\.\pipe\vexwave-nobody-` + rand.Text() + `-`, timing: fast}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p.ServiceStartup(ctx, application.ServiceOptions{})
	t0 := time.Now()
	if s := enable(t, p, true); s.Connection != "offline" || time.Since(t0) > time.Second {
		t.Fatalf("%+v after %v", s, time.Since(t0))
	}
}

func TestPubliclyRoutable(t *testing.T) {
	for in, want := range map[string]bool{
		"https://music.example.com": true, "http://8.8.8.8": true, "http://[2001:db8::1]": true,
		"http://10.0.0.1": false, "http://100.70.0.1": false, "http://169.254.1.1": false, "http://240.0.0.1": false,
		"http://[::1]": false, "http://[fd00::1]": false, "http://localhost:8790": false, "http://nas.local": false, "http://nas": false,
	} {
		if got := publiclyRoutable(in); got != want {
			t.Errorf("%s: %v", in, got)
		}
	}
	if clampText(" a ") != "a " || len([]rune(clampText(string(make([]rune, 300))))) != maxText {
		t.Error("clampText")
	}
}
