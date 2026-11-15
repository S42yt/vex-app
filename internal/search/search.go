package search

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
)

var (
	ErrSuperseded = errors.New("Superseded by a newer search.")
	errTimedOut   = errors.New("The search timed out.")
)

const (
	searchTimeout = 45 * time.Second
	maxQueryRunes = 200
)

var sources = map[string]func(*SearchService, context.Context, string) ([]Result, error){
	"youtube":    (*SearchService).searchYouTubeMusic,
	"soundcloud": (*SearchService).searchSoundCloud,
}

type SearchService struct {
	Bin   string
	Busy  *busy.Registry
	Proxy func() string

	mu     sync.Mutex
	cancel context.CancelCauseFunc
	gen    uint64
}

type SearchParams struct {
	Query  string `json:"query"`
	Source string `json:"source"`
}

type Result struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	URL          string `json:"url"`
	Artist       string `json:"artist,omitempty"`
	DurationSec  int    `json:"durationSec,omitempty"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
}

func (s *SearchService) Search(ctx context.Context, p SearchParams) ([]Result, error) {
	term := strings.Join(strings.Fields(p.Query), " ")
	if r := []rune(term); len(r) > maxQueryRunes {
		term = string(r[:maxQueryRunes])
	}
	find, ok := sources[p.Source]
	if !ok {
		return nil, errors.New("Unknown search source.")
	}
	if term == "" {
		return []Result{}, nil
	}

	ctx, cancel := context.WithCancelCause(ctx)
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel(ErrSuperseded)
	}
	s.cancel = cancel
	s.gen++
	gen := s.gen
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		if s.gen == gen {
			s.cancel = nil
		}
		s.mu.Unlock()
		cancel(nil)
	}()

	run, stop := context.WithTimeoutCause(ctx, searchTimeout, errTimedOut)
	defer stop()
	results, err := find(s, run, term)
	if cause := context.Cause(run); cause == ErrSuperseded || cause == errTimedOut {
		return nil, cause
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return results, err
}
