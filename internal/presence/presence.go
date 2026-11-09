package presence

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Microsoft/go-winio"
	"github.com/VexWave/vex-app/internal/backend"
	"github.com/VexWave/vex-app/internal/events"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const applicationID = "1533078418541908019"

const (
	logoAsset         = "vexwave"
	activityListening = 2
	maxFrameBytes     = 1 << 20
	maxPipeIndex      = 9
	busyPipeWait      = 500 * time.Millisecond
	minText, maxText  = 2, 128
)

const (
	opHandshake = 0
	opFrame     = 1
	opClose     = 2
	opPing      = 3
	opPong      = 4
)

type timing struct{ debounce, floor, reconnect, handshake time.Duration }

var production = timing{time.Second, 5 * time.Second, 10 * time.Second, 5 * time.Second}

type Track struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Artist      string  `json:"artist,omitempty"`
	HasCover    bool    `json:"hasCover"`
	PositionSec float64 `json:"positionSec"`
	DurationSec float64 `json:"durationSec"`
}

type Refusal struct {
	Code    int    `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type Status struct {
	Connection string   `json:"connection"`
	Refusal    *Refusal `json:"refusal,omitempty"`
	Seq        uint64   `json:"seq"`
}

const StatusEvent = "presence:status"

func init() { application.RegisterEvent[Status](StatusEvent) }

type PresenceService struct {
	Events  events.Emitter
	BaseURL func() string

	pipePrefix string
	timing     timing
	enable     chan enableReq
	playing    chan *Track
}

type enableReq struct {
	on    bool
	reply chan Status
}

func (p *PresenceService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	if p.pipePrefix == "" {
		p.pipePrefix = `\\.\pipe\discord-ipc-`
	}
	if p.timing == (timing{}) {
		p.timing = production
	}
	p.enable, p.playing = make(chan enableReq), make(chan *Track)
	go p.loop(ctx)
	return nil
}

type EnableParams struct {
	Enabled bool `json:"enabled"`
}

func (p *PresenceService) SetEnabled(ctx context.Context, e EnableParams) (Status, error) {
	r := enableReq{e.Enabled, make(chan Status, 1)}
	select {
	case p.enable <- r:
		return <-r.reply, nil
	case <-ctx.Done():
		return Status{}, ctx.Err()
	}
}

type NowPlaying struct {
	Track *Track `json:"track"`
}

func (p *PresenceService) SetNowPlaying(ctx context.Context, n NowPlaying) {
	select {
	case p.playing <- n.Track:
	case <-ctx.Done():
	}
}

type frame struct {
	conn io.ReadWriteCloser
	op   uint32
	body []byte
	err  error
}

type message struct {
	Evt   string          `json:"evt"`
	Nonce string          `json:"nonce"`
	Data  json.RawMessage `json:"data"`
}

func stopped() *time.Timer { t := time.NewTimer(time.Hour); t.Stop(); return t }

func (p *PresenceService) loop(ctx context.Context) {
	var (
		enabled, ready, shown, dialing bool
		conn                           io.ReadWriteCloser
		now                            *Track
		pendingNonce                   string
		refusal                        *Refusal
		lastReported                   *Status
		lastSent                       time.Time
		frames                         = make(chan frame)
		dialed                         = make(chan io.ReadWriteCloser)
		update, reconnect, handshake   = stopped(), stopped(), stopped()
		seq                            uint64
	)
	status := func() Status {
		seq++
		switch {
		case !ready:
			return Status{Connection: "offline", Seq: seq}
		case refusal != nil:
			return Status{Connection: "refused", Refusal: refusal, Seq: seq}
		}
		return Status{Connection: "connected", Seq: seq}
	}
	report := func() {
		s := status()
		if lastReported != nil && lastReported.Connection == s.Connection && (lastReported.Refusal == nil) == (s.Refusal == nil) &&
			(s.Refusal == nil || *lastReported.Refusal == *s.Refusal) {
			return
		}
		lastReported = &s
		p.Events.Emit(StatusEvent, s)
	}
	startDial := func() {
		if dialing || conn != nil || !enabled {
			return
		}
		dialing = true
		go func() {
			c := p.dial(ctx)
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
		if ready {
			update.Reset(max(p.timing.debounce, p.timing.floor-time.Since(lastSent)))
		}
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
					now, pendingNonce, refusal, lastReported = nil, "", nil, nil
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
					reconnect.Reset(p.timing.reconnect)
				}
				continue
			}
			conn, shown, pendingNonce, refusal, lastReported = c, false, "", nil, nil
			go readLoop(c, frames)
			writeJSON(c, opHandshake, map[string]any{"v": 1, "client_id": applicationID})
			handshake.Reset(p.timing.handshake)
		case f := <-frames:
			if f.conn != conn {
				continue
			}
			switch {
			case f.err != nil || f.op == opClose:
				wasReady := ready
				drop()
				if wasReady {
					report()
				}
				reconnect.Reset(p.timing.reconnect)
			case f.op == opPing:
				writeFrame(conn, opPong, f.body)
			case f.op == opFrame:
				var m message
				if json.Unmarshal(f.body, &m) != nil {
					continue
				}
				if m.Evt == "READY" {
					ready = true
					handshake.Stop()
					report()
					schedule()
					continue
				}
				if m.Nonce == "" || m.Nonce != pendingNonce {
					continue
				}
				pendingNonce, refusal = "", nil
				if m.Evt == "ERROR" {
					refusal = &Refusal{}
					json.Unmarshal(m.Data, refusal)
				}
				report()
			}
		case <-handshake.C:
			drop()
			reconnect.Reset(p.timing.reconnect)
		case <-reconnect.C:
			startDial()
		case <-update.C:
			if !ready || (now == nil && !shown) {
				continue
			}
			lastSent, shown = time.Now(), now != nil
			pendingNonce = rand.Text()
			args := map[string]any{"pid": os.Getpid()}
			if now != nil {
				args["activity"] = p.activity(now)
			}
			writeJSON(conn, opFrame, map[string]any{"cmd": "SET_ACTIVITY", "args": args, "nonce": pendingNonce})
		}
	}
}

func (p *PresenceService) dial(ctx context.Context) io.ReadWriteCloser {
	for i := 0; i <= maxPipeIndex; i++ {
		ctx, cancel := context.WithTimeout(ctx, busyPipeWait)
		c, err := winio.DialPipeContext(ctx, fmt.Sprint(p.pipePrefix, i))
		cancel()
		if err == nil {
			return c
		}
	}
	return nil
}

func readLoop(c io.ReadWriteCloser, out chan<- frame) {
	for {
		var hdr [8]byte
		if _, err := io.ReadFull(c, hdr[:]); err != nil {
			out <- frame{conn: c, err: err}
			return
		}
		n := binary.LittleEndian.Uint32(hdr[4:])
		if n > maxFrameBytes {
			out <- frame{conn: c, err: errors.New("frame too large")}
			return
		}
		body := make([]byte, n)
		if _, err := io.ReadFull(c, body); err != nil {
			out <- frame{conn: c, err: err}
			return
		}
		out <- frame{conn: c, op: binary.LittleEndian.Uint32(hdr[:4]), body: body}
	}
}

func writeJSON(c io.Writer, op uint32, v any) {
	body, _ := json.Marshal(v)
	writeFrame(c, op, body)
}

// Header and body go out in one write: Discord reads frames whole, and a header delivered
// without its payload stalls the connection.
func writeFrame(c io.Writer, op uint32, body []byte) {
	buf := make([]byte, 8+len(body))
	binary.LittleEndian.PutUint32(buf, op)
	binary.LittleEndian.PutUint32(buf[4:], uint32(len(body)))
	copy(buf[8:], body)
	c.Write(buf)
}

func (p *PresenceService) activity(t *Track) map[string]any {
	start := time.Now().UnixMilli() - int64(t.PositionSec*1000+0.5)
	timestamps := map[string]any{"start": start}
	if t.DurationSec > 0 {
		timestamps["end"] = start + int64(t.DurationSec*1000+0.5)
	}
	assets := map[string]any{"large_image": logoAsset}
	if cover := p.coverURL(t); cover != "" {
		assets = map[string]any{"large_image": cover, "small_image": logoAsset, "small_text": "VexWave"}
	}
	a := map[string]any{"type": activityListening, "details": clampText(t.Title), "timestamps": timestamps, "assets": assets}
	if t.Artist != "" {
		a["state"] = clampText(t.Artist)
	}
	return a
}

func (p *PresenceService) coverURL(t *Track) string {
	if !t.HasCover || p.BaseURL == nil {
		return ""
	}
	base := p.BaseURL()
	if base == "" || !publiclyRoutable(base) {
		return ""
	}
	return base + backend.TrackImagePath(t.ID, "")
}

func publiclyRoutable(baseURL string) bool {
	u, err := url.Parse(baseURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if ip, err := netip.ParseAddr(host); err == nil {
		ip = ip.Unmap()
		cgnat := netip.MustParsePrefix("100.64.0.0/10")
		if ip.Is4() && (ip.As4()[0] == 0 || ip.As4()[0] >= 224) {
			return false
		}
		return ip.IsGlobalUnicast() && !ip.IsPrivate() && !cgnat.Contains(ip)
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}
	for _, suffix := range []string{".local", ".internal", ".lan", ".home", ".home.arpa"} {
		if strings.HasSuffix(host, suffix) {
			return false
		}
	}
	return strings.Contains(host, ".")
}

func clampText(s string) string {
	s = strings.TrimSpace(s)
	switch n := utf8.RuneCountInString(s); {
	case n < minText:
		return s + strings.Repeat(" ", minText-n)
	case n > maxText:
		return string([]rune(s)[:maxText-1]) + "…"
	}
	return s
}
