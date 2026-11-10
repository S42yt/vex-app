package datadirs

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLayout(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/xdg/data")
	if l := Default(); l.Webview("canary") != "/xdg/data/VexWaveData/canary/webview" {
		t.Fatal(l.Webview("canary"))
	}
	t.Setenv("XDG_DATA_HOME", "relative")
	home, _ := os.UserHomeDir()
	if l := Default(); l.Root != filepath.Join(home, ".local", "share", "VexWaveData") {
		t.Fatal(l.Root)
	}
}
