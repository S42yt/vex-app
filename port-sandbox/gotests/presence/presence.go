// Package presence models DiscordPresence.ts as one actor goroutine that owns the
// socket, the state and every timer; callers talk to it through channels.
package presence

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"time"
)

const (
	opHandshake = 0
	opFrame     = 1
	opClose     = 2
)

type Timing struct{ Debounce, Floor, Reconnect, Handshake time.Duration }

var Production = Timing{time.Second, 5 * time.Second, 10 * time.Second, 5 * time.Second}

type Track struct{ Title, Artist string }

type Status struct {
	Connected bool
	Refused   string
}

type Dialer func(ctx context.Context) (io.ReadWriteCloser, error)

type frame struct {
	conn io.ReadWriteCloser
	op   uint32
	msg  map[string]any
	err  error // read loop ended
}

type enableReq struct {
	on    bool
	reply chan Status
}

type Presence struct {
	enable   chan enableReq
	playing  chan *Track
	OnStatus func(Status)
}

func New(ctx context.Context, dial Dialer, t Timing) *Presence {
	p := &Presence{enable: make(chan enableReq), playing: make(chan *Track)}
	go p.loop(ctx, dial, t)
	return p
}

// SetEnabled is a request: it returns the connection state it leaves behind.
func (p *Presence) SetEnabled(on bool) Status {
	r := enableReq{on, make(chan Status, 1)}
	p.enable <- r
	return <-r.reply
}

func (p *Presence) SetNowPlaying(t *Track) { p.playing <- t }

func stopped() *time.Timer { t := time.NewTimer(time.Hour); t.Stop(); return t }

func (p *Presence) loop(ctx context.Context, dial Dialer, t Timing) {
	var (
		enabled, ready, shown bool
		conn                  io.ReadWriteCloser
		now                   *Track
		lastSent              time.Time
		frames                = make(chan frame)
		dialed                = make(chan io.ReadWriteCloser)
		update, reconnect     = stopped(), stopped()
		handshake             = stopped()
		dialing               bool
	)
	status := func() Status { return Status{Connected: ready} }
	report := func() {
		if p.OnStatus != nil {
			p.OnStatus(status())
		}
	}
	startDial := func() {
		if dialing || conn != nil || !enabled {
			return
		}
		dialing = true
		go func() {
			c, err := dial(ctx)
			if err != nil {
				c = nil
			}
			select {
			case dialed <- c:
			case <-ctx.Done():
				if c != nil {
					c.Close()
				}
			}
		}()
	}
	schedule := func() {
		if !ready {
			return
		}
		wait := max(t.Debounce, t.Floor-time.Since(lastSent))
		update.Reset(wait)
	}
	drop := func() {
		if conn != nil {
			conn.Close()
		}
		conn, ready = nil, false
		update.Stop()
		handshake.Stop()
	}
	for {
		select {
		case <-ctx.Done():
			drop()
			return
		case r := <-p.enable:
			if r.on != enabled {
				enabled = r.on
				if enabled {
					startDial()
				} else {
					now = nil
					reconnect.Stop()
					drop()
				}
			}
			r.reply <- status()
		case tr := <-p.playing:
			now = tr
			schedule()
		case c := <-dialed:
			dialing = false
			if !enabled || c == nil {
				if c != nil {
					c.Close()
				}
				if enabled {
					reconnect.Reset(t.Reconnect)
				}
				continue
			}
			conn, shown = c, false
			go readLoop(c, frames)
			writeJSON(c, opHandshake, map[string]any{"v": 1, "client_id": "app"})
			handshake.Reset(t.Handshake)
		case f := <-frames:
			if f.conn != conn {
				continue // from a socket already dropped
			}
			if f.err != nil || f.op == opClose {
				wasReady := ready
				drop()
				if wasReady {
					report()
				}
				reconnect.Reset(t.Reconnect)
				continue
			}
			if f.msg["evt"] == "READY" {
				ready = true
				handshake.Stop()
				report()
				schedule()
			}
		case <-handshake.C:
			drop()
			reconnect.Reset(t.Reconnect)
		case <-reconnect.C:
			startDial()
		case <-update.C:
			if !ready || (now == nil && !shown) {
				continue
			}
			lastSent, shown = time.Now(), now != nil
			var act any
			if now != nil {
				act = map[string]any{"details": now.Title, "state": now.Artist}
			}
			writeJSON(conn, opFrame, map[string]any{"cmd": "SET_ACTIVITY", "args": map[string]any{"activity": act}})
		}
	}
}

func readLoop(c io.ReadWriteCloser, out chan<- frame) {
	for {
		var hdr [8]byte
		if _, err := io.ReadFull(c, hdr[:]); err != nil {
			out <- frame{conn: c, err: err}
			return
		}
		body := make([]byte, binary.LittleEndian.Uint32(hdr[4:]))
		if _, err := io.ReadFull(c, body); err != nil {
			out <- frame{conn: c, err: err}
			return
		}
		var m map[string]any
		json.Unmarshal(body, &m)
		out <- frame{conn: c, op: binary.LittleEndian.Uint32(hdr[:4]), msg: m}
	}
}

func writeJSON(c io.Writer, op uint32, v any) error {
	body, _ := json.Marshal(v)
	buf := make([]byte, 8+len(body))
	binary.LittleEndian.PutUint32(buf, op)
	binary.LittleEndian.PutUint32(buf[4:], uint32(len(body)))
	copy(buf[8:], body)
	_, err := c.Write(buf) // one write per frame, as DiscordPresence.ts does
	return err
}
