// Package session models ApiClient's session swap with an immutable value behind atomic.Pointer.
package session

import (
	"context"
	"errors"
	"sync/atomic"
)

type Session struct {
	BaseURL, Token, Proxy string
}

var (
	ErrNotLoggedIn = errors.New("Not logged in")
	ErrChanged     = errors.New("The session changed while checking the proxy.")
)

type Store struct{ cur atomic.Pointer[Session] }

func (s *Store) Current() (*Session, bool) { p := s.cur.Load(); return p, p != nil }
func (s *Store) Restore(v Session)         { s.cur.Store(&v) }
func (s *Store) Logout()                   { s.cur.Store(nil) }

// Expire drops the session only if it is still the one that got the 401.
func (s *Store) Expire(seen *Session) { s.cur.CompareAndSwap(seen, nil) }

// SetProxy probes with the new proxy, then swaps it in only if no login/logout happened meanwhile.
func (s *Store) SetProxy(ctx context.Context, proxy string, probe func(context.Context, Session) error) error {
	old := s.cur.Load()
	if old == nil {
		return ErrNotLoggedIn
	}
	next := *old
	next.Proxy = proxy
	if err := probe(ctx, next); err != nil {
		return err
	}
	if !s.cur.CompareAndSwap(old, &next) {
		return ErrChanged
	}
	return nil
}
