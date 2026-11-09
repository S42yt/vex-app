package search

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/ytdlp/ytdlptest"
)

func service(t *testing.T) *SearchService {
	return &SearchService{Bin: ytdlptest.Bin(t), Busy: &busy.Registry{}, Proxy: func() string { return "" }}
}

func (s *SearchService) active() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.cancel != nil }

func TestResultsRanked(t *testing.T) {
	s := service(t)
	got, err := s.Search(context.Background(), SearchParams{Query: "  daft   punk ", Source: "youtube"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Title != "daft punk (Official Audio)" || got[0].ID != "youtube:v1" ||
		got[0].Artist != "Artist" || got[0].DurationSec != 200 || got[0].ThumbnailURL != "big" {
		t.Fatalf("%+v", got)
	}
	if _, err := s.Search(context.Background(), SearchParams{Query: "fail", Source: "soundcloud"}); err == nil || err.Error() != "[generic] scsearch24:fail: Unsupported URL" {
		t.Fatalf("failure: %v", err)
	}
}

func TestNewestWins(t *testing.T) {
	s := service(t)
	errA := make(chan error, 1)
	go func() {
		_, err := s.Search(context.Background(), SearchParams{Query: "slow", Source: "youtube"})
		errA <- err
	}()
	for !s.active() {
		time.Sleep(time.Millisecond)
	}
	if res, err := s.Search(context.Background(), SearchParams{Query: "b", Source: "youtube"}); err != nil || len(res) != 3 {
		t.Fatal(res, err)
	}
	if err := <-errA; !errors.Is(err, ErrSuperseded) {
		t.Fatalf("first search: %v", err)
	}
	if s.active() || s.Busy.Held(busy.Search) != 0 {
		t.Fatal("search state left behind")
	}
}

func TestCallerCancelIsNotSuperseded(t *testing.T) {
	s := service(t)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(200 * time.Millisecond); cancel() }()
	if _, err := s.Search(ctx, SearchParams{Query: "slow", Source: "youtube"}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestRefusedWhileInstalling(t *testing.T) {
	s := service(t)
	release, _ := s.Busy.Acquire(busy.Install)
	defer release()
	if _, err := s.Search(context.Background(), SearchParams{Query: "a", Source: "youtube"}); err != busy.ErrInstalling {
		t.Fatal(err)
	}
}

func TestStorm(t *testing.T) {
	s := service(t)
	var wg sync.WaitGroup
	for i := range 30 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Search(context.Background(), SearchParams{Query: fmt.Sprint(i), Source: "youtube"}); err != nil && !errors.Is(err, ErrSuperseded) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if s.active() || s.Busy.Held(busy.Search) != 0 {
		t.Fatal("search state left behind")
	}
}
