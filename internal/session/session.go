package session

import (
	"context"
	"errors"
	"sync/atomic"

	"github.com/VexWave/vex-app/internal/backend"
	"github.com/VexWave/vex-app/internal/netx"
)

type Session struct {
	BaseURL, Token, Proxy string
}

var ErrChanged = errors.New("The session changed while checking the proxy.")

type Store struct{ cur atomic.Pointer[Session] }

func (s *Store) Current() (*Session, bool) { p := s.cur.Load(); return p, p != nil }
func (s *Store) Restore(v Session)         { s.cur.Store(&v) }
func (s *Store) Logout()                   { s.cur.Store(nil) }

func (s *Store) Expire(seen *Session) bool { return s.cur.CompareAndSwap(seen, nil) }

func (s *Store) Proxy() string {
	if p := s.cur.Load(); p != nil {
		return p.Proxy
	}
	return ""
}

func (s *Store) BaseURL() string {
	if p := s.cur.Load(); p != nil {
		return p.BaseURL
	}
	return ""
}

func (s *Store) SetProxy(ctx context.Context, proxy string, probe func(context.Context, Session) error) error {
	old := s.cur.Load()
	if old == nil {
		return backend.ErrNotLoggedIn
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

func (v *Session) client() *backend.Client {
	return &backend.Client{BaseURL: v.BaseURL, Token: v.Token, HTTP: netx.For(v.Proxy).API}
}

func (s *Store) With(fn func(*backend.Client) error) error {
	cur, ok := s.Current()
	if !ok {
		return backend.ErrNotLoggedIn
	}
	err := fn(cur.client())
	if unauthorized(err) {
		s.Expire(cur)
	}
	return err
}

func unauthorized(err error) bool {
	var f *backend.Failure
	return errors.As(err, &f) && f.Status == 401
}
