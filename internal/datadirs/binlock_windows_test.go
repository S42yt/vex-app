package datadirs

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestRunningExeCannotBeReplaced(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "yt-dlp.exe")
	src, _ := os.ReadFile(filepath.Join(os.Getenv("SystemRoot"), "System32", "PING.EXE"))
	os.WriteFile(exe, src, 0o755)
	cmd := exec.Command(exe, "-n", "30", "127.0.0.1")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { cmd.Process.Kill(); cmd.Wait() }()
	time.Sleep(300 * time.Millisecond)

	next := filepath.Join(dir, "yt-dlp.new")
	os.WriteFile(next, []byte("new"), 0o755)
	errRename := os.Rename(next, exe)
	errRemove := os.Remove(exe)
	t.Logf("rename over running exe: %v | remove: %v", errRename, errRemove)
	if errRename == nil || errRemove == nil {
		t.Fatal("a running exe was replaced")
	}
}
