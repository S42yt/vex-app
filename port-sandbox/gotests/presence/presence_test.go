package presence

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"sync"
	"testing"
	"time"
)

type fakeDiscord struct {
	mu    sync.Mutex
	sends []sent
	conns int
}

type sent struct {
	at  time.Time
	act map[string]any
}

func (d *fakeDiscord) dial(ctx context.Context) (io.ReadWriteCloser, error) {
	client, server := net.Pipe()
	d.mu.Lock()
	d.conns++
	d.mu.Unlock()
	go func() {
		defer server.Close()
		for {
			var hdr [8]byte
			if _, err := io.ReadFull(server, hdr[:]); err != nil {
				return
			}
			body := make([]byte, binary.LittleEndian.Uint32(hdr[4:]))
			io.ReadFull(server, body)
			var m map[string]any
			json.Unmarshal(body, &m)
			if binary.LittleEndian.Uint32(hdr[:]) == opHandshake {
				writeJSON(server, opFrame, map[string]any{"evt": "READY"})
				continue
			}
			args, _ := m["args"].(map[string]any)
			act, _ := args["activity"].(map[string]any)
			d.mu.Lock()
			d.sends = append(d.sends, sent{time.Now(), act})
			d.mu.Unlock()
		}
	}()
	return client, nil
}

func (d *fakeDiscord) snapshot() []sent {
	d.mu.Lock()
	defer d.mu.Unlock()
	return append([]sent(nil), d.sends...)
}

var fast = Timing{Debounce: 20 * time.Millisecond, Floor: 100 * time.Millisecond, Reconnect: 50 * time.Millisecond, Handshake: 200 * time.Millisecond}

// Bursts of track changes from many goroutines: sends stay >= Floor apart, the last track wins.
func TestDebounceFloorAndLastWins(t *testing.T) {
	d := &fakeDiscord{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	connected := make(chan struct{}, 1)
	p := New(ctx, d.dial, fast)
	p.OnStatus = func(s Status) {
		if s.Connected {
			select {
			case connected <- struct{}{}:
			default:
			}
		}
	}
	p.SetEnabled(true)
	<-connected

	var wg sync.WaitGroup
	for round := 0; round < 5; round++ {
		for i := 0; i < 20; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); p.SetNowPlaying(&Track{Title: "burst", Artist: "x"}) }()
		}
		wg.Wait()
		time.Sleep(30 * time.Millisecond)
	}
	p.SetNowPlaying(&Track{Title: "final", Artist: "y"})
	time.Sleep(fast.Floor + 3*fast.Debounce)

	s := d.snapshot()
	if len(s) == 0 || s[len(s)-1].act["details"] != "final" {
		t.Fatalf("last send %v", s)
	}
	for i := 1; i < len(s); i++ {
		if gap := s[i].at.Sub(s[i-1].at); gap < fast.Floor-5*time.Millisecond {
			t.Fatalf("sends %d and %d only %v apart", i-1, i, gap)
		}
	}
	t.Logf("%d track changes produced %d SET_ACTIVITY sends", 101, len(s))
}

func TestDisableDropsSocketAndReconnects(t *testing.T) {
	d := &fakeDiscord{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p := New(ctx, d.dial, fast)
	if st := p.SetEnabled(true); st.Connected {
		t.Fatal("connected before handshake")
	}
	time.Sleep(50 * time.Millisecond)
	if st := p.SetEnabled(true); !st.Connected {
		t.Fatal("not connected after handshake")
	}
	if st := p.SetEnabled(false); st.Connected {
		t.Fatal("still connected after disable")
	}
	for i := 0; i < 50; i++ { // concurrent toggles and track changes
		go p.SetEnabled(i%2 == 0)
		go p.SetNowPlaying(nil)
	}
	time.Sleep(100 * time.Millisecond)
}
