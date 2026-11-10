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

	stop := holder(t, bin, "shared")
	if _, err := LockBin(bin, true, false); !errors.Is(err, ErrBinBusy) {
		t.Fatalf("install during another process's run: %v", err)
	}
	rel, err := LockBin(bin, false, false)
	if err != nil {
		t.Fatalf("concurrent runs: %v", err)
	}
	rel()

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

	stop = holder(t, bin, "exclusive")
	if _, err := LockBin(bin, false, false); !errors.Is(err, ErrBinBusy) {
		t.Fatalf("run during another process's install: %v", err)
	}
	stop()

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
