package upload

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf16"

	"github.com/VexWave/vex-app/internal/backend"
	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/session"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const MaxAudioBytes = backend.MaxAudioBase64 / 4 * 3

type Staged struct {
	ID         string `json:"id"`
	FileName   string `json:"fileName"`
	Title      string `json:"title"`
	DurationMs int    `json:"durationMs"`
	CoverURL   string `json:"coverUrl,omitempty"`
	Error      string `json:"error,omitempty"`
}

type entry struct {
	path       string
	durationMs int
	cover      []byte
	owned      bool
}

func (e *entry) done() {
	if e.owned {
		os.Remove(e.path)
	}
}

type UploadService struct {
	Bin      string
	Busy     *busy.Registry
	Store    *session.Store
	CoverURL func(id string) string

	mu     sync.Mutex
	staged map[string]*entry
	last   chan struct{}
}

func (u *UploadService) Pick(ctx context.Context) ([]Staged, error) {
	paths, err := application.Get().Dialog.OpenFile().
		CanChooseFiles(true).
		AddFilter("Audio", "*.mp3;*.m4a;*.flac;*.ogg;*.opus;*.wav;*.aac;*.mp4").
		PromptForMultipleSelection()
	// The dialog package that defines this error is internal to Wails.
	if err != nil && err.Error() == "cancelled by user" {
		return []Staged{}, nil
	}
	if err != nil {
		return nil, err
	}
	return u.Stage(ctx, paths, false)
}

//wails:ignore
func (u *UploadService) Stage(ctx context.Context, paths []string, owned bool) ([]Staged, error) {
	unlock, err := datadirs.LockBin(u.Bin, false, false)
	if err != nil {
		return nil, err
	}
	defer unlock()
	out := []Staged{}
	for _, path := range paths {
		s := Staged{FileName: filepath.Base(path)}
		fi, err := os.Stat(path)
		switch {
		case err != nil:
			s.Error = "This file can't be read."
		case fi.Size() > MaxAudioBytes:
			s.Error = tooLarge(fi.Size())
		}
		if s.Error != "" {
			out = append(out, s)
			continue
		}
		p, err := probe(ctx, u.Bin, path)
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if err != nil {
			s.Error = "This file has no audio VexWave can read."
			out = append(out, s)
			continue
		}
		s.ID = rand.Text()
		s.Title = clampTitle(p.Title)
		s.DurationMs = min(max(p.DurationMs, 0), backend.MaxDurationMs)
		if len(p.Cover) > 0 {
			s.CoverURL = u.CoverURL(s.ID)
		}
		u.mu.Lock()
		if u.staged == nil {
			u.staged = map[string]*entry{}
		}
		u.staged[s.ID] = &entry{path: path, durationMs: s.DurationMs, cover: p.Cover, owned: owned}
		u.mu.Unlock()
		out = append(out, s)
	}
	return out, nil
}

//wails:ignore
func (u *UploadService) Cover(id string) ([]byte, bool) {
	u.mu.Lock()
	defer u.mu.Unlock()
	e, ok := u.staged[id]
	if !ok || len(e.cover) == 0 {
		return nil, false
	}
	return e.cover, true
}

func (u *UploadService) Discard(ids []string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, id := range ids {
		if e := u.staged[id]; e != nil {
			e.done()
			delete(u.staged, id)
		}
	}
}

type ConfirmParams struct {
	StagedID    string                   `json:"stagedId"`
	Title       string                   `json:"title"`
	ArtistIDs   []int32                  `json:"artistIds"`
	CoverBase64 backend.Nullable[string] `json:"coverBase64,omitzero"`
}

func (u *UploadService) Confirm(ctx context.Context, p ConfirmParams) error {
	u.mu.Lock()
	e := u.staged[p.StagedID]
	delete(u.staged, p.StagedID)
	prev, done := u.last, make(chan struct{})
	if e != nil {
		u.last = done
	}
	u.mu.Unlock()
	if e == nil {
		return errors.New("This track is no longer waiting to upload.")
	}
	defer close(done)
	defer e.done()
	release, err := u.Busy.Acquire(busy.Transfer)
	if err != nil {
		return err
	}
	defer release()
	if prev != nil {
		<-prev
	}

	m := meta{Title: clampTitle(p.Title), Duration: e.durationMs, ArtistIDs: p.ArtistIDs}
	switch {
	case p.CoverBase64.Set && !p.CoverBase64.Null:
		m.Cover = p.CoverBase64.V
	case !p.CoverBase64.Set && len(e.cover) > 0:
		m.Cover = base64.StdEncoding.EncodeToString(e.cover)
	}
	return u.Store.With(func(c *backend.Client) error {
		f, err := os.Open(e.path)
		if err != nil {
			return errors.New("The file can't be read anymore.")
		}
		defer f.Close()
		b, stop, err := body(m, f)
		if err != nil {
			return err
		}
		defer stop()
		return c.PostTrack(ctx, b)
	})
}

type meta struct {
	Title     string  `json:"title"`
	Duration  int     `json:"duration"`
	ArtistIDs []int32 `json:"artistIds,omitempty"`
	Cover     string  `json:"cover,omitempty"`
}

func body(m meta, f *os.File) (backend.Stream, func(), error) {
	st, err := f.Stat()
	if err != nil {
		return backend.Stream{}, nil, err
	}
	if st.Size() > MaxAudioBytes {
		return backend.Stream{}, nil, errors.New(tooLarge(st.Size()))
	}
	head, err := json.Marshal(m)
	if err != nil {
		return backend.Stream{}, nil, err
	}
	prefix := append(head[:len(head)-1:len(head)-1], `,"data":"`...)
	suffix := []byte(`"}`)
	pr, pw := io.Pipe()
	go func() {
		enc := base64.NewEncoder(base64.StdEncoding, pw)
		_, err := io.Copy(enc, f)
		if err == nil {
			err = enc.Close()
		}
		pw.CloseWithError(err)
	}()
	n := int64(len(prefix)) + int64(base64.StdEncoding.EncodedLen(int(st.Size()))) + int64(len(suffix))
	return backend.Stream{Reader: io.MultiReader(bytes.NewReader(prefix), pr, bytes.NewReader(suffix)), Len: n},
		func() { pr.Close() }, nil
}

func tooLarge(size int64) string {
	mb := func(b int64) string { return fmt.Sprintf("%.1f MB", float64(b)/(1<<20)) }
	return "That track is " + mb(size) + " — the server accepts up to " + mb(MaxAudioBytes) + "."
}

// zod counts UTF-16 units.
func clampTitle(title string) string {
	title = strings.TrimSpace(title)
	units := 0
	for i, r := range title {
		units += utf16.RuneLen(r)
		if units > backend.MaxNameLength {
			title = strings.TrimSpace(title[:i])
			break
		}
	}
	if title == "" {
		return "Untitled"
	}
	return title
}
