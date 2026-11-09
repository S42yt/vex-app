// Package ytdlptest builds a fake yt-dlp.exe (./fake) for tests of the code that runs it.
package ytdlptest

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// Bin returns a fresh bin folder holding the fake yt-dlp.exe.
func Bin(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	_, self, _, _ := runtime.Caller(0)
	out, err := exec.Command("go", "build", "-o", filepath.Join(dir, "yt-dlp.exe"), filepath.Join(filepath.Dir(self), "fake")).CombinedOutput()
	if err != nil {
		t.Fatalf("building the fake yt-dlp: %v\n%s", err, out)
	}
	return dir
}
