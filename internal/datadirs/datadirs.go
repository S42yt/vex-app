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

// Channel is an installable channel and the name of its Uninstall key (NSIS UNINST_KEY_NAME).
type Channel struct{ Name, UninstallKey string }

// Installed reports whether <path>\<key> exists under base and carries an UninstallString.
func Installed(base registry.Key, path, key string) (bool, error) {
	k, err := registry.OpenKey(base, path+`\`+key, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer k.Close()
	s, _, err := k.GetStringValue("UninstallString")
	if errors.Is(err, registry.ErrNotExist) {
		return false, nil
	}
	return s != "", err
}

// RemoveData deletes self's folder, then bin\ and the root unless another channel is
// installed. A registry error counts as installed: shared data is kept when unsure.
func (l Layout) RemoveData(self string, others []Channel, installed func(Channel) (bool, error)) (sharedRemoved bool, err error) {
	if err := os.RemoveAll(l.Channel(self)); err != nil {
		return false, err
	}
	for _, c := range others {
		if ok, err := installed(c); ok || err != nil {
			return false, nil
		}
	}
	return true, os.RemoveAll(l.Root)
}
