// Package search models MediaSearch's "newest query wins" with context cancellation.
package search

import (
	"context"
	"errors"
	"sync"
)

var ErrSuperseded = errors.New("Superseded by a newer search.")

type Runner func(ctx context.Context, term string) ([]string, error)

type Service struct {
	run Runner

	mu     sync.Mutex
	cancel context.CancelCauseFunc
	gen    uint64
}

func New(run Runner) *Service { return &Service{run: run} }

// Search cancels the running search (its caller gets ErrSuperseded) and starts this one.
// ctx is the Wails call context, so a frontend promise.cancel() also stops it.
func (s *Service) Search(ctx context.Context, term string) ([]string, error) {
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

	res, err := s.run(ctx, term)
	if cause := context.Cause(ctx); errors.Is(cause, ErrSuperseded) {
		return nil, ErrSuperseded
	}
	return res, err
}

func (s *Service) Active() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.cancel != nil }
