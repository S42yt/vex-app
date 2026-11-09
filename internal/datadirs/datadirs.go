package datadirs

import (
	"errors"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const UninstallPath = `Software\Microsoft\Windows\CurrentVersion\Uninstall`

type Layout struct{ Root string }

func Default() Layout { return Layout{filepath.Join(os.Getenv("LOCALAPPDATA"), "VexWaveData")} }

func (l Layout) Bin() string              { return filepath.Join(l.Root, "bin") }
func (l Layout) Channel(ch string) string { return filepath.Join(l.Root, ch) }
func (l Layout) Webview(ch string) string { return filepath.Join(l.Root, ch, "webview") }
func (l Layout) Imports(ch string) string { return filepath.Join(l.Root, ch, "imports") }

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

func Installed(base registry.Key, path, key string) (bool, error) {
	s, err := UninstallString(base, path, key)
	return s != "", err
}

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
