package datadirs

import (
	"os"
	"path/filepath"
)

func Default() Layout {
	data := os.Getenv("XDG_DATA_HOME")
	if !filepath.IsAbs(data) {
		home, _ := os.UserHomeDir()
		data = filepath.Join(home, ".local", "share")
	}
	return Layout{filepath.Join(data, "VexWaveData")}
}
