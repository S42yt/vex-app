package search

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

func slowRunner(d time.Duration) Runner {
	return func(ctx context.Context, term string) ([]string, error) {
		select {
		case <-time.After(d):
			return []string{term}, nil
		case <-ctx.Done():
			return nil, ctx.Err() // what exec.CommandContext's kill surfaces as
		}
	}
}

func TestNewestWins(t *testing.T) {
	s := New(slowRunner(200 * time.Millisecond))
	errA := make(chan error, 1)
	go func() { _, err := s.Search(context.Background(), "a"); errA <- err }()
	time.Sleep(20 * time.Millisecond)
	res, err := s.Search(context.Background(), "b")
	if err != nil || res[0] != "b" {
		t.Fatal(res, err)
	}
	if err := <-errA; !errors.Is(err, ErrSuperseded) {
		t.Fatalf("first search: %v", err)
	}
	if s.Active() {
		t.Fatal("still active")
	}
}

func TestCallerCancelIsNotSuperseded(t *testing.T) {
	s := New(slowRunner(time.Second))
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(20 * time.Millisecond); cancel() }()
	_, err := s.Search(ctx, "a")
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

// Many overlapping searches: exactly the last one started may succeed, none leak.
func TestStorm(t *testing.T) {
	s := New(slowRunner(5 * time.Millisecond))
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Search(context.Background(), fmt.Sprint(i)); err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			} else if !errors.Is(err, ErrSuperseded) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	t.Logf("%d of 200 overlapping searches completed, rest superseded", ok)
	if s.Active() {
		t.Fatal("leaked cancel func")
	}
}
