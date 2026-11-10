package datadirs

import (
	"os"
	"path/filepath"
)

type Layout struct{ Root string }

func (l Layout) Bin() string              { return filepath.Join(l.Root, "bin") }
func (l Layout) Channel(ch string) string { return filepath.Join(l.Root, ch) }
func (l Layout) Webview(ch string) string { return filepath.Join(l.Root, ch, "webview") }
func (l Layout) Imports(ch string) string { return filepath.Join(l.Root, ch, "imports") }

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
