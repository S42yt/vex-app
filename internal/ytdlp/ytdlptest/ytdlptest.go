package ytdlptest

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/VexWave/vex-app/internal/platform"
)

func Bin(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	_, self, _, _ := runtime.Caller(0)
	out, err := exec.Command("go", "build", "-o", filepath.Join(dir, platform.Exe("yt-dlp")), filepath.Join(filepath.Dir(self), "fake")).CombinedOutput()
	if err != nil {
		t.Fatalf("building the fake yt-dlp: %v\n%s", err, out)
	}
	return dir
}
