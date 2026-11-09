package datadirs

import (
	"bufio"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// bin\ is shared by every channel, and busy.Registry only sees its own process.
// Windows refuses to replace or delete an exe while it runs.
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

// Holder process: takes the lock in the mode given by env, prints "held", waits for stdin EOF.
func TestMain(m *testing.M) {
	if mode := os.Getenv("BINLOCK_HOLD"); mode != "" {
		release, err := LockBin(os.Getenv("BINLOCK_DIR"), mode == "exclusive", false)
		if err != nil {
			os.Stdout.WriteString("err " + err.Error() + "\n")
			os.Exit(1)
		}
		os.Stdout.WriteString("held\n")
		io.Copy(io.Discard, os.Stdin)
		release()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func holder(t *testing.T, bin, mode string) (stop func()) {
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), "BINLOCK_HOLD="+mode, "BINLOCK_DIR="+bin)
	in, _ := cmd.StdinPipe()
	out, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	line, _ := bufio.NewReader(out).ReadString('\n')
	if line != "held\n" {
		t.Fatalf("holder: %q", line)
	}
	return func() { in.Close(); cmd.Wait() }
}

func TestBinLockAcrossProcesses(t *testing.T) {
	bin := filepath.Join(t.TempDir(), "bin")

	// Another channel is running yt-dlp: an install here is refused, a second run is allowed.
	stop := holder(t, bin, "shared")
	if _, err := LockBin(bin, true, false); !errors.Is(err, ErrBinBusy) {
		t.Fatalf("install during another process's run: %v", err)
	}
	rel, err := LockBin(bin, false, false)
	if err != nil {
		t.Fatalf("concurrent runs: %v", err)
	}
	rel()

	// A waiting install proceeds once the other process lets go.
	done := make(chan error, 1)
	go func() {
		rel, err := LockBin(bin, true, true)
		if err == nil {
			rel()
		}
		done <- err
	}()
	select {
	case err := <-done:
		t.Fatalf("waiting install did not wait: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	stop()
	if err := <-done; err != nil {
		t.Fatal(err)
	}

	// Another channel is installing: a run here is refused.
	stop = holder(t, bin, "exclusive")
	if _, err := LockBin(bin, false, false); !errors.Is(err, ErrBinBusy) {
		t.Fatalf("run during another process's install: %v", err)
	}
	stop()

	// A crashed holder leaves no lock behind.
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), "BINLOCK_HOLD=exclusive", "BINLOCK_DIR="+bin)
	cmd.StdinPipe()
	out, _ := cmd.StdoutPipe()
	cmd.Start()
	bufio.NewReader(out).ReadString('\n')
	cmd.Process.Kill()
	cmd.Wait()
	rel, err = LockBin(bin, true, false)
	if err != nil {
		t.Fatalf("after holder was killed: %v", err)
	}
	rel()
}
