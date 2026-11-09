// Package download saves a library track to a folder the user picks.
package download

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf16"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Tracks is the media server: the cache, the shared download, or the backend.
type Tracks interface {
	Reader(ctx context.Context, id string) (io.ReadCloser, error)
}

// DownloadService is bound.
type DownloadService struct {
	Busy   *busy.Registry
	Tracks Tracks
}

type SaveParams struct {
	ID             string `json:"id"`
	FileName       string `json:"fileName"`
	StartingFolder string `json:"startingFolder,omitempty"`
}

// Saved is empty when the folder dialog was cancelled.
type Saved struct {
	Path   string `json:"path,omitempty"`
	Folder string `json:"folder,omitempty"`
}

func (d *DownloadService) SaveTrack(ctx context.Context, p SaveParams) (Saved, error) {
	dir, err := application.Get().Dialog.OpenFile().
		CanChooseFiles(false).
		CanChooseDirectories(true).
		SetDirectory(startFolder(p.StartingFolder)).
		PromptForSingleSelection()
	// The dialog package that defines this error is internal to Wails.
	if err != nil && err.Error() == "cancelled by user" {
		return Saved{}, nil
	}
	if err != nil {
		return Saved{}, err
	}
	if dir == "" {
		return Saved{}, nil
	}
	release, err := d.Busy.Acquire(busy.Transfer)
	if err != nil {
		return Saved{}, err
	}
	defer release()
	rd, err := d.Tracks.Reader(ctx, p.ID)
	if err != nil {
		return Saved{}, err
	}
	defer rd.Close()
	path, err := save(rd, dir, p.FileName)
	if err != nil {
		return Saved{}, err
	}
	return Saved{Path: path, Folder: dir}, nil
}

// startFolder is the remembered folder while it still exists, else the home folder: Wails'
// dialog fails without opening when its start folder is gone.
func startFolder(remembered string) string {
	if fi, err := os.Stat(remembered); remembered != "" && err == nil && fi.IsDir() {
		return remembered
	}
	home, _ := os.UserHomeDir()
	return home
}

func save(r io.Reader, dir, name string) (string, error) {
	br := bufio.NewReader(r)
	head, _ := br.Peek(12)
	ext := extensionOf(head)
	f, err := create(dir, fitName(dir, SafeName(name, "Track"), ext), ext)
	if err != nil {
		return "", err
	}
	_, err = io.Copy(f, br)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

const maxNameAttempts = 100

// create takes the first free "name.ext", "name (2).ext", … without a check-then-write race.
func create(dir, base, ext string) (*os.File, error) {
	for n := 1; n <= maxNameAttempts; n++ {
		name := base + ext
		if n > 1 {
			name = fmt.Sprintf("%s (%d)%s", base, n, ext)
		}
		f, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if !errors.Is(err, os.ErrExist) {
			return f, err
		}
	}
	return nil, fmt.Errorf("%s%s and %d numbered copies already exist", base, ext, maxNameAttempts)
}

const (
	// Under Windows' MAX_PATH of 260, counted in UTF-16 units.
	maxPathUnits = 250
	// What most file systems allow one path component, in bytes.
	maxNameBytes = 255
	suffixLen    = len(" (100)")
)

func fitName(dir, base, ext string) string {
	unitBudget := maxPathUnits - utf16Len(dir) - 1 - suffixLen - utf16Len(ext)
	byteBudget := maxNameBytes - suffixLen - len(ext)
	units, end := 0, 0
	for i, r := range base {
		units += utf16.RuneLen(r)
		if units > unitBudget || i+len(string(r)) > byteBudget {
			break
		}
		end = i + len(string(r))
	}
	// A trailing space before the extension is another name Windows quietly refuses.
	if kept := strings.TrimRightFunc(base[:end], unicode.IsSpace); kept != "" {
		return kept
	}
	return "Track"
}

func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

// SafeName replaces the characters Windows refuses in a file name.
func SafeName(name, fallback string) string {
	cleaned := strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 0x20 || strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, name))
	if cleaned == "" {
		return fallback
	}
	return cleaned
}

func extensionOf(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte("ID3")), len(b) > 1 && b[0] == 0xff && b[1]&0xe0 == 0xe0:
		return ".mp3"
	case bytes.HasPrefix(b, []byte("fLaC")):
		return ".flac"
	case bytes.HasPrefix(b, []byte("OggS")):
		return ".ogg"
	case bytes.HasPrefix(b, []byte("RIFF")) && len(b) >= 12 && string(b[8:12]) == "WAVE":
		return ".wav"
	case len(b) >= 8 && string(b[4:8]) == "ftyp":
		return ".m4a"
	}
	return ".mp3"
}
