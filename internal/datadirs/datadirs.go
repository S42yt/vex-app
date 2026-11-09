// Package datadirs is the port's data layout under %LOCALAPPDATA%\VexWaveData and the
// uninstall rule for it: a channel's own folder always goes; bin\ and the root go only
// when no other channel is still installed.
package datadirs

import (
	"errors"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

// UninstallPath is where the NSIS per-user install writes its key (HKCU).
const UninstallPath = `Software\Microsoft\Windows\CurrentVersion\Uninstall`

type Layout struct{ Root string }

func Default() Layout { return Layout{filepath.Join(os.Getenv("LOCALAPPDATA"), "VexWaveData")} }

func (l Layout) Bin() string              { return filepath.Join(l.Root, "bin") }
func (l Layout) Channel(ch string) string { return filepath.Join(l.Root, ch) }
func (l Layout) Webview(ch string) string { return filepath.Join(l.Root, ch, "webview") }
func (l Layout) Imports(ch string) string { return filepath.Join(l.Root, ch, "imports") }

// UninstallString reads <path>\<key>\UninstallString under base; it is "" when the key or
// the value is absent.
func UninstallString(base registry.Key, path, key string) (string, error) {
	k, err := registry.OpenKey(base, path+`\`+key, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer k.Close()
	s, _, err := k.GetStringValue("UninstallString")
	if errors.Is(err, registry.ErrNotExist) {
		return "", nil
	}
	return s, err
}

// Installed reports whether the channel whose Uninstall key is key is installed.
func Installed(base registry.Key, path, key string) (bool, error) {
	s, err := UninstallString(base, path, key)
	return s != "", err
}

// RemoveData deletes self's folder, then bin\ and the root unless a channel with one of the
// others' Uninstall keys is installed. A registry error counts as installed: shared data is
// kept when unsure.
func (l Layout) RemoveData(self string, others []string, installed func(key string) (bool, error)) error {
	if err := os.RemoveAll(l.Channel(self)); err != nil {
		return err
	}
	for _, key := range others {
		if ok, err := installed(key); ok || err != nil {
			return nil
		}
	}
	return os.RemoveAll(l.Root)
}
