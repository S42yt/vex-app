// Package update drives Wails' updater against the GitHub releases: check, download in the
// background, then hand over to its swap helper and quit.
package update

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/netx"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

const repository = "VexWave/vex-app"

// Configure points u at the GitHub releases, with every request going through the session's proxy.
func Configure(u *updater.Updater, version string, proxy func() string) error {
	return configure(u, version, github.Config{
		Repository:    repository,
		ChecksumAsset: "SHA256SUMS",
		HTTPClient:    &http.Client{Transport: proxied(proxy)},
	})
}

func configure(u *updater.Updater, version string, gc github.Config) error {
	gh, err := github.New(gc)
	if err != nil {
		return err
	}
	return u.Init(updater.Config{CurrentVersion: version, Providers: []updater.Provider{gh}, Window: updater.WindowNone})
}

type proxied func() string

// The stream client sends no Accept-Encoding, so a release asset keeps its Content-Length for the progress bar.
func (p proxied) RoundTrip(r *http.Request) (*http.Response, error) {
	return netx.For(p()).Stream.Transport.RoundTrip(r)
}

// UpdateService is bound. Progress reaches the UI as Wails' own wails:updater:* events.
type UpdateService struct {
	Updater *updater.Updater // nil on a channel that never updates itself
	Busy    *busy.Registry
	// Installed says whether this copy came from the installer; only that copy may swap its exe.
	Installed func() bool

	ctx         context.Context
	mu          sync.Mutex
	latest      string
	downloading bool
}

func (s *UpdateService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	s.ctx = ctx
	return nil
}

type Available struct {
	LatestVersion string `json:"latestVersion,omitempty"`
}

// Check reports a newer release; any failure reads as "no update", as the banner has nothing to say about it.
func (s *UpdateService) Check(ctx context.Context) Available {
	if s.Updater == nil {
		return Available{}
	}
	rel, err := s.Updater.Check(ctx)
	if err != nil || rel == nil {
		return Available{}
	}
	s.mu.Lock()
	s.latest = rel.Version
	s.mu.Unlock()
	return Available{rel.Version}
}

// Download starts the download and returns; it ends with update-ready or error.
func (s *UpdateService) Download() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch {
	case s.latest == "":
		return errors.New("There is no update to download.")
	case s.downloading:
		return errors.New("The update is already downloading.")
	}
	release, err := s.Busy.Acquire(busy.AppDownload)
	if err != nil {
		return err
	}
	s.downloading = true
	go func() {
		defer release()
		s.Updater.DownloadAndInstall(s.ctx)
		s.mu.Lock()
		s.downloading = false
		s.mu.Unlock()
	}()
	return nil
}

// Refusal is an install that didn't start; DownloadMissing sends the banner back to the download step.
type Refusal struct {
	Message         string `json:"error"`
	DownloadMissing bool   `json:"downloadMissing,omitempty"`
}

func (r *Refusal) Error() string { return r.Message }

// Install hands the downloaded exe to the swap helper and quits the app.
func (s *UpdateService) Install(ctx context.Context) error {
	if reason := s.Busy.QuitBlocker(); reason != "" {
		return &Refusal{Message: reason}
	}
	path := ""
	if s.Updater != nil {
		path = s.Updater.DownloadedPath()
	}
	if _, err := os.Stat(path); path == "" || err != nil {
		return &Refusal{Message: "The downloaded update is gone — download it again.", DownloadMissing: true}
	}
	if !s.Installed() {
		return &Refusal{Message: "Only an installed copy of VexWave can update itself."}
	}
	if err := s.Updater.Restart(ctx); err != nil {
		return &Refusal{Message: "The update couldn't start: " + err.Error()}
	}
	return nil
}
