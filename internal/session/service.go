package session

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/VexWave/vex-app/internal/backend"
	"github.com/VexWave/vex-app/internal/events"
	"github.com/VexWave/vex-app/internal/media"
	"github.com/VexWave/vex-app/internal/netx"
)

type SessionService struct{ Store *Store }

type LoginParams struct {
	BaseURL  string `json:"baseUrl"`
	Username string `json:"username"`
	Password string `json:"password"`
	ProxyURL string `json:"proxyUrl,omitempty"`
}

type RestoreParams struct {
	BaseURL  string `json:"baseUrl"`
	Token    string `json:"token"`
	ProxyURL string `json:"proxyUrl,omitempty"`
}

type ProxyParams struct {
	ProxyURL string `json:"proxyUrl,omitempty"`
}

const probeTimeout = 30 * time.Second

func (s *SessionService) Login(ctx context.Context, p LoginParams) (string, error) {
	s.Store.Logout()
	c := &backend.Client{BaseURL: p.BaseURL, HTTP: netx.For(p.ProxyURL).API}
	token, err := c.Login(ctx, p.Username, p.Password)
	if err != nil {
		return "", describe(err, p.BaseURL, p.ProxyURL)
	}
	s.Store.Restore(Session{p.BaseURL, token, p.ProxyURL})
	return token, nil
}

func (s *SessionService) RestoreSession(p RestoreParams) {
	s.Store.Restore(Session{p.BaseURL, p.Token, p.ProxyURL})
}

func (s *SessionService) Logout() { s.Store.Logout() }

func (s *SessionService) SetProxy(ctx context.Context, p ProxyParams) error {
	cur, _ := s.Store.Current()
	err := s.Store.SetProxy(ctx, p.ProxyURL, func(ctx context.Context, next Session) error {
		ctx, cancel := context.WithTimeout(ctx, probeTimeout)
		defer cancel()
		err := next.client().Do(ctx, http.MethodGet, "/data", nil, nil, "Checking the proxy failed", backend.NoPayload)
		return describe(err, next.BaseURL, next.Proxy)
	})
	if unauthorized(err) && cur != nil {
		s.Store.Expire(cur)
	}
	return err
}

func describe(err error, baseURL, proxy string) error {
	var f *backend.Failure
	if err == nil || errors.As(err, &f) || errors.Is(err, context.Canceled) {
		return err
	}
	return &backend.Failure{Message: netx.Unreachable(baseURL, proxy, err)}
}

type MediaSession struct {
	Store  *Store
	Events events.Emitter
}

func (m MediaSession) Route() (media.Route, bool) {
	cur, ok := m.Store.Current()
	if !ok {
		return media.Route{}, false
	}
	return media.Route{
		BaseURL: cur.BaseURL,
		Token:   cur.Token,
		Client:  netx.For(cur.Proxy).Stream,
		Expire: func() {
			if m.Store.Expire(cur) {
				m.Events.Emit(events.SessionExpired, events.SessionExpiredData{Reason: "Session expired — please log in again."})
			}
		},
	}, true
}
