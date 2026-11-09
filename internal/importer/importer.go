package importer

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/download"
	"github.com/VexWave/vex-app/internal/events"
	"github.com/VexWave/vex-app/internal/netx"
	"github.com/VexWave/vex-app/internal/upload"
	"github.com/VexWave/vex-app/internal/ytdlp"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	Progress = "import:progress"
	Staged   = "import:staged"
	Failed   = "import:failed"
)

type Step struct {
	ImportID      string `json:"importId"`
	Step          string `json:"step"`
	Title         string `json:"title,omitempty"`
	ReceivedBytes int64  `json:"receivedBytes,omitempty"`
	TotalBytes    int64  `json:"totalBytes,omitempty"`
}

type Artist struct {
	Name        string `json:"name"`
	ImageBase64 string `json:"imageBase64,omitempty"`
	ImageMime   string `json:"imageMime,omitempty"`
}

type Ready struct {
	ImportID string        `json:"importId"`
	Staged   upload.Staged `json:"staged"`
	Artist   *Artist       `json:"artist,omitempty"`
}

type Failure struct {
	ImportID string `json:"importId"`
	Error    string `json:"error"`
}

func init() {
	application.RegisterEvent[Step](Progress)
	application.RegisterEvent[Ready](Staged)
	application.RegisterEvent[Failure](Failed)
}

const (
	titleMark      = "VEX>T "
	downloadMark   = "VEX>D "
	postMark       = "VEX>P"
	artistMark     = "VEX>A "
	channelURLMark = "VEX>U "
	avatarMark     = "VEX>I "

	maxAvatarBytes = 5 << 20
	avatarTimeout  = 20 * time.Second
	progressEvery  = 150 * time.Millisecond
	staleAfter     = time.Hour
	queueSize      = 64
)

var (
	ErrQueueFull = errors.New("Too many imports are queued.")
	reUUID       = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

type ImportService struct {
	Dir    string
	Bin    string
	Busy   *busy.Registry
	Proxy  func() string
	Events events.Emitter
	Stage  func(ctx context.Context, path string) (upload.Staged, error)

	jobs chan job
}

type job struct {
	ID, URL string
	release func()
}

func (s *ImportService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	if entries, err := os.ReadDir(s.Dir); err == nil {
		for _, e := range entries {
			if info, err := e.Info(); err == nil && time.Since(info.ModTime()) > staleAfter {
				os.RemoveAll(filepath.Join(s.Dir, e.Name()))
			}
		}
	}
	s.jobs = make(chan job, queueSize)
	go s.worker(ctx, s.jobs)
	return nil
}

type StartParams struct {
	ImportID string `json:"importId"`
	URL      string `json:"url"`
}

func (s *ImportService) Start(p StartParams) error {
	if !reUUID.MatchString(p.ImportID) {
		return errors.New("Invalid import id.")
	}
	if u, err := url.Parse(p.URL); err != nil || u.Scheme == "" || u.Host == "" {
		return errors.New("Invalid URL.")
	}
	release, err := s.Busy.Acquire(busy.Import)
	if err != nil {
		return err
	}
	select {
	case s.jobs <- job{p.ImportID, p.URL, release}:
		return nil
	default:
		release()
		return ErrQueueFull
	}
}

func (s *ImportService) worker(ctx context.Context, jobs <-chan job) {
	for {
		select {
		case <-ctx.Done():
			return
		case j := <-jobs:
			err := s.run(ctx, j)
			j.release()
			if err != nil {
				s.Events.Emit(Failed, Failure{ImportID: j.ID, Error: err.Error()})
			}
		}
	}
}

func (s *ImportService) run(ctx context.Context, j job) error {
	s.Events.Emit(Progress, Step{ImportID: j.ID, Step: "starting"})
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return err
	}
	path, title, artist, err := s.download(ctx, j)
	if err != nil {
		if matches, _ := filepath.Glob(filepath.Join(s.Dir, j.ID+".*")); matches != nil {
			for _, m := range matches {
				os.Remove(m)
			}
		}
		return err
	}
	s.Events.Emit(Progress, Step{ImportID: j.ID, Step: "staging", Title: title})
	staged, err := s.Stage(ctx, path)
	if err == nil && staged.Error != "" {
		err = errors.New(staged.Error)
	}
	if err != nil {
		os.Remove(path)
		return err
	}
	staged.FileName = download.SafeName(title, "Imported track") + ".mp3"
	s.Events.Emit(Staged, Ready{ImportID: j.ID, Staged: staged, Artist: artist})
	return nil
}

func (s *ImportService) download(ctx context.Context, j job) (path, title string, artist *Artist, err error) {
	unlock, err := datadirs.LockBin(s.Bin, false, false)
	if err != nil {
		return "", "", nil, err
	}
	defer unlock()
	path = filepath.Join(s.Dir, j.ID+".mp3")
	cmd := ytdlp.Command(ctx, s.Bin, s.Proxy(),
		"--no-playlist", "--playlist-items", "1",
		"-x", "--audio-format", "mp3", "--audio-quality", "0",
		"--embed-metadata", "--embed-thumbnail",
		"--ffmpeg-location", s.Bin,
		"--progress", "--newline",
		"--progress-template", "download:"+downloadMark+"%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
		"--progress-template", "postprocess:"+postMark,
		"--print", "before_dl:"+titleMark+"%(title)s",
		"--print", "before_dl:"+artistMark+"%(channel,uploader,artist,creator)s",
		"--print", "before_dl:"+channelURLMark+"%(channel_url,uploader_url)s",
		"-o", filepath.Join(s.Dir, j.ID+".%(ext)s"),
		j.URL,
	)
	var stderr ytdlp.Tail
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", "", nil, err
	}
	if err := cmd.Start(); err != nil {
		return "", "", nil, err
	}

	var name string
	var avatar chan *Artist
	var last time.Time
	emit := func(step Step, always bool) {
		if !always && time.Since(last) < progressEvery {
			return
		}
		last = time.Now()
		step.ImportID, step.Title = j.ID, title
		s.Events.Emit(Progress, step)
	}
	ytdlp.Lines(stdout, func(line string) {
		switch {
		case strings.HasPrefix(line, titleMark):
			title = strings.TrimSpace(line[len(titleMark):])
			emit(Step{Step: "starting"}, true)
		case strings.HasPrefix(line, artistMark):
			name = ytdlp.CleanField(line[len(artistMark):])
		case strings.HasPrefix(line, channelURLMark):
			if u := ytdlp.CleanField(line[len(channelURLMark):]); u != "" {
				avatar = make(chan *Artist, 1)
				go func() { avatar <- s.channelAvatar(ctx, u) }()
			}
		case strings.HasPrefix(line, downloadMark):
			f := strings.Fields(line[len(downloadMark):])
			for len(f) < 3 {
				f = append(f, "")
			}
			total := ytdlp.Number(f[1])
			if total == 0 {
				total = ytdlp.Number(f[2])
			}
			emit(Step{Step: "downloading", ReceivedBytes: ytdlp.Number(f[0]), TotalBytes: total}, false)
		case strings.HasPrefix(line, postMark):
			emit(Step{Step: "converting"}, true)
		}
	})
	runErr := cmd.Wait()
	if _, err := os.Stat(path); runErr != nil || err != nil {
		if ctx.Err() != nil {
			return "", "", nil, ctx.Err()
		}
		return "", "", nil, errors.New(ytdlp.Failure(runErr, stderr.String()))
	}
	if name = ytdlp.CleanArtistName(name); name != "" {
		artist = &Artist{Name: name}
		if avatar != nil {
			if img := <-avatar; img != nil {
				artist.ImageBase64, artist.ImageMime = img.ImageBase64, img.ImageMime
			}
		}
	}
	return path, title, artist, nil
}

func (s *ImportService) channelAvatar(ctx context.Context, channelURL string) *Artist {
	about := aboutURL(channelURL)
	if about == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, avatarTimeout)
	defer cancel()
	out, _ := ytdlp.Command(ctx, s.Bin, s.Proxy(),
		"--flat-playlist", "--playlist-items", "0",
		"--print", "playlist:"+avatarMark+"%(thumbnails)j",
		about,
	).Output()
	var imageURL string
	ytdlp.Lines(strings.NewReader(string(out)), func(line string) {
		if raw, ok := strings.CutPrefix(line, avatarMark); ok && imageURL == "" {
			imageURL = pickAvatar(raw)
		}
	})
	if imageURL == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil
	}
	res, err := netx.For(s.Proxy()).API.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	mt, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(mt, "image/") {
		return nil
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, maxAvatarBytes+1))
	if err != nil || len(b) == 0 || len(b) > maxAvatarBytes {
		return nil
	}
	return &Artist{ImageBase64: base64.StdEncoding.EncodeToString(b), ImageMime: mt}
}

func aboutURL(channelURL string) string {
	u, err := url.Parse(channelURL)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	if host != "youtube.com" && !strings.HasSuffix(host, ".youtube.com") {
		return ""
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/about"
	return u.String()
}

func pickAvatar(raw string) string {
	var thumbs []struct {
		ID     string  `json:"id"`
		URL    *string `json:"url"`
		Width  float64 `json:"width"`
		Height float64 `json:"height"`
	}
	if json.Unmarshal([]byte(strings.TrimSpace(raw)), &thumbs) != nil {
		return ""
	}
	best, bestWidth := "", 0.0
	for _, t := range thumbs {
		if t.URL == nil {
			continue
		}
		if t.ID == "avatar_uncropped" {
			return *t.URL
		}
		if t.Width > 0 && t.Width == t.Height && (best == "" || t.Width > bestWidth) {
			best, bestWidth = *t.URL, t.Width
		}
	}
	return best
}
