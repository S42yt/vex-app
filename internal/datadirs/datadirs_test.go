package datadirs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

var channels = map[string]string{"stable": "VexWave", "canary": "VexWave Canary"}

func others(self string) []string {
	var out []string
	for ch, key := range channels {
		if ch != self {
			out = append(out, key)
		}
	}
	return out
}

func populate(t *testing.T) Layout {
	l := Layout{filepath.Join(t.TempDir(), "VexWaveData")}
	for _, p := range []string{l.Bin(), l.Webview("stable"), l.Imports("stable"), l.Webview("canary"), l.Imports("canary")} {
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
		os.WriteFile(filepath.Join(p, "f"), []byte("x"), 0o644)
	}
	return l
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

func TestUninstallKeepsSharedWhenUnsure(t *testing.T) {
	l := populate(t)
	err := l.RemoveData("canary", others("canary"), func(string) (bool, error) { return false, errors.New("access denied") })
	if err != nil || !exists(l.Bin()) {
		t.Fatal("registry error removed shared data")
	}
}

func TestUninstallToleratesMissingFolders(t *testing.T) {
	l := Layout{filepath.Join(t.TempDir(), "never-created")}
	if err := l.RemoveData("stable", others("stable"), func(string) (bool, error) { return false, nil }); err != nil {
		t.Fatal(err)
	}
}
