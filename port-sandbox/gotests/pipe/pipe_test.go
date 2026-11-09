package pipe

import (
	"io"
	"os"
	"testing"
	"time"

	"github.com/Microsoft/go-winio"
)

const path = `\\.\pipe\vexwave-probe-ipc`

// Can the stdlib (os.OpenFile) stand in for winio.DialPipe as a Discord IPC client?
func TestStdlibPipeClient(t *testing.T) {
	ln, err := winio.ListenPipe(path, nil) // stands in for Discord's server end
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		buf := make([]byte, 5)
		io.ReadFull(c, buf)
		c.Write([]byte("pong!"))
		time.Sleep(5 * time.Second) // then go quiet, like Discord between frames
		c.Close()
	}()

	time.Sleep(200 * time.Millisecond) // let Accept post its instance; winio.DialPipe retries ERROR_PIPE_BUSY itself
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	f.Write([]byte("ping!"))
	buf := make([]byte, 5)
	if _, err := io.ReadFull(f, buf); err != nil || string(buf) != "pong!" {
		t.Fatalf("%q %v", buf, err)
	}
	// A reader goroutine blocked on a quiet pipe must be released by Close (disable/quit).
	done := make(chan error, 1)
	go func() { _, err := f.Read(buf); done <- err }()
	time.Sleep(200 * time.Millisecond)
	f.Close()
	select {
	case err := <-done:
		t.Logf("os.File: Close released the blocked Read: %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("os.File: Close did not release the blocked Read")
	}
}

func TestWinioPipeClient(t *testing.T) {
	ln, err := winio.ListenPipe(path+"2", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() { c, _ := ln.Accept(); time.Sleep(5 * time.Second); c.Close() }()
	timeout := time.Second
	c, err := winio.DialPipe(path+"2", &timeout)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := c.Read(make([]byte, 5)); done <- err }()
	time.Sleep(200 * time.Millisecond)
	c.Close()
	select {
	case err := <-done:
		t.Logf("winio: Close released the blocked Read: %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("winio: Close did not release the blocked Read")
	}
}

// Dialing a pipe nobody serves (Discord not running) fails fast either way.
func TestNoServer(t *testing.T) {
	t0 := time.Now()
	_, err := os.OpenFile(path+"-none", os.O_RDWR, 0)
	t.Logf("os.OpenFile on a missing pipe: %v after %v", err, time.Since(t0))
	if err == nil {
		t.Fatal("opened a pipe that does not exist")
	}
}
