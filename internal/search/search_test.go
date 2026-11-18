package search

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
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
	got, err := s.Search(context.Background(), SearchParams{Query: "  daft   punk ", Source: "soundcloud"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Title != "daft punk (Official Audio)" || got[0].ID != "soundcloud:v1" ||
		got[0].Artist != "Artist" || got[0].DurationSec != 200 || got[0].ThumbnailURL != "big" {
		t.Fatalf("%+v", got)
	}
	if _, err := s.Search(context.Background(), SearchParams{Query: "fail", Source: "soundcloud"}); err == nil || err.Error() != "[generic] scsearch24:fail: Unsupported URL" {
		t.Fatalf("failure: %v", err)
	}
}

func musicServer(t *testing.T, status int) {
	page, err := os.ReadFile("testdata/music-search.json")
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Query  string `json:"query"`
			Params string `json:"params"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Query != "tell em" || body.Params != musicSongsParams {
			t.Errorf("request: %+v", body)
		}
		w.WriteHeader(status)
		w.Write(page)
	}))
	t.Cleanup(srv.Close)
	old := musicSearchURL
	musicSearchURL = srv.URL
	t.Cleanup(func() { musicSearchURL = old })
}

func TestYouTubeMusicKeepsItsOrder(t *testing.T) {
	musicServer(t, http.StatusOK)
	got, err := service(t).Search(context.Background(), SearchParams{Query: " tell  em ", Source: "youtube"})
	if err != nil {
		t.Fatal(err)
	}
	want := []Result{
		{ID: "youtube:Q--Wk-5sXDA", Title: "Tell Em", URL: "https://www.youtube.com/watch?v=Q--Wk-5sXDA", Artist: "Cochise & $NOT", DurationSec: 181, ThumbnailURL: "https://yt3.googleusercontent.com/cover=w544-h544-l90-rj"},
		{ID: "youtube:9novE4hIgJ4", Title: "Tell Em", URL: "https://www.youtube.com/watch?v=9novE4hIgJ4", Artist: "Rich Homie Quan"},
	}
	if !slices.Equal(got, want) {
		t.Fatalf("%+v", got)
	}
}

func TestYouTubeMusicRefusal(t *testing.T) {
	musicServer(t, http.StatusForbidden)
	if _, err := service(t).Search(context.Background(), SearchParams{Query: "tell em", Source: "youtube"}); err == nil || err.Error() != "YouTube Music answered the search with HTTP 403." {
		t.Fatal(err)
	}
}

func TestNewestWins(t *testing.T) {
	s := service(t)
	errA := make(chan error, 1)
	go func() {
		_, err := s.Search(context.Background(), SearchParams{Query: "slow", Source: "soundcloud"})
		errA <- err
	}()
	for !s.active() {
		time.Sleep(time.Millisecond)
	}
	if res, err := s.Search(context.Background(), SearchParams{Query: "b", Source: "soundcloud"}); err != nil || len(res) != 3 {
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
	if _, err := s.Search(ctx, SearchParams{Query: "slow", Source: "soundcloud"}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestRefusedWhileInstalling(t *testing.T) {
	s := service(t)
	release, _ := s.Busy.Acquire(busy.Install)
	defer release()
	if _, err := s.Search(context.Background(), SearchParams{Query: "a", Source: "soundcloud"}); err != busy.ErrInstalling {
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
			if _, err := s.Search(context.Background(), SearchParams{Query: fmt.Sprint(i), Source: "soundcloud"}); err != nil && !errors.Is(err, ErrSuperseded) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if s.active() || s.Busy.Held(busy.Search) != 0 {
		t.Fatal("search state left behind")
	}
}
