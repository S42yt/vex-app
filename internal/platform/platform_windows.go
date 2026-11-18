package platform

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

const (
	quitDelay = 500 * time.Millisecond
	exitWait  = 2 * time.Minute
)

func Exe(name string) string { return name + ".exe" }

func Command(ctx context.Context, bin, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	// exec keeps the last of case-insensitively equal keys on Windows, so this wins over an inherited Path=.
	cmd.Env = append(os.Environ(), "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	return cmd
}

func HandOff(mode string, quit func(), args ...string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	helper := filepath.Join(os.TempDir(), "vexwave-"+strings.TrimPrefix(mode, "--")+"-"+rand.Text()+".exe")
	if err := CopyFile(exe, helper); err != nil {
		return err
	}
	if err := SpawnDetached(exec.Command(helper, append([]string{mode, strconv.Itoa(os.Getpid())}, args...)...)); err != nil {
		os.Remove(helper)
		return err
	}
	time.AfterFunc(quitDelay, quit)
	return nil
}

func HelperCopies() []string {
	copies, _ := filepath.Glob(filepath.Join(os.TempDir(), "vexwave-*-helper-*.exe"))
	return copies
}

func CopyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	return out.Close()
}

// A job that forbids breakaway refuses the flag, so it retries without.
func SpawnDetached(cmd *exec.Cmd) error {
	const flags = windows.DETACHED_PROCESS | windows.CREATE_NO_WINDOW | windows.CREATE_NEW_PROCESS_GROUP
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: flags | windows.CREATE_BREAKAWAY_FROM_JOB}
	err := cmd.Start()
	if errors.Is(err, windows.ERROR_ACCESS_DENIED) {
		retry := exec.Command(cmd.Path, cmd.Args[1:]...)
		retry.Env, retry.Dir = cmd.Env, cmd.Dir
		retry.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: flags}
		cmd, err = retry, retry.Start()
	}
	if err != nil {
		return err
	}
	return cmd.Process.Release()
}

func WaitExit(pid string) error {
	n, err := strconv.ParseUint(pid, 10, 32)
	if err != nil {
		return err
	}
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(n))
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(h)
	if ev, err := windows.WaitForSingleObject(h, uint32(exitWait/time.Millisecond)); ev != windows.WAIT_OBJECT_0 {
		return errors.Join(errors.New("the app didn't exit"), err)
	}
	return nil
}
