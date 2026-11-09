// Package busy replaces index.ts's ytDlpBusyReason/unlessInstalling/quitBusyReason
// with one atomic check-and-acquire.
package busy

import (
	"errors"
	"sync"
)

type Kind int

const (
	Import Kind = iota
	Search
	Install
	AppDownload
	Transfer
	numKinds
)

var (
	ErrInstalling = errors.New("Components are updating — try again in a moment.")
	ErrYtDlpInUse = errors.New("yt-dlp is running — try again when it's done.")
)

// conflicts[k] lists kinds that must not be held while k is acquired.
var conflicts = [numKinds][]Kind{
	Import:  {Install},
	Search:  {Install},
	Install: {Import, Search, Install},
}

type Registry struct {
	mu   sync.Mutex
	held [numKinds]int
}

// Acquire refuses if a conflicting kind is held; otherwise it holds k until release.
func (r *Registry) Acquire(k Kind) (release func(), err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, c := range conflicts[k] {
		if r.held[c] > 0 {
			if c == Install {
				return nil, ErrInstalling
			}
			return nil, ErrYtDlpInUse
		}
	}
	r.held[k]++
	var once sync.Once
	return func() {
		once.Do(func() { r.mu.Lock(); r.held[k]--; r.mu.Unlock() })
	}, nil
}

func (r *Registry) Held(k Kind) int { r.mu.Lock(); defer r.mu.Unlock(); return r.held[k] }

// QuitBlocker returns why quitting now would cut something off, or "".
func (r *Registry) QuitBlocker() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch {
	case r.held[Install] > 0:
		return ErrInstalling.Error()
	case r.held[AppDownload] > 0:
		return "A VexWave update is downloading — try again when it's done."
	case r.held[Transfer] > 0:
		return "A track is uploading or saving — try again when it's done."
	case r.held[Import] > 0:
		return "A URL import is running — try again when it's done."
	case r.held[Search] > 0:
		return "A search is running — try again in a moment."
	}
	return ""
}
