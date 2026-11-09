// Package uninstall removes an installed copy: the in-app button hands over to a helper copy
// of the exe that waits for the app to quit and runs the NSIS uninstaller, which calls back
// into RemoveData.
package uninstall

import (
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

	"github.com/VexWave/vex-app/internal/buildinfo"
	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	quitDelay = 500 * time.Millisecond
	exitWait  = 2 * time.Minute
)

// InstallDir is the folder this channel's installer put the app in, if the running exe is inside it.
func InstallDir() (string, bool) {
	exe, err := os.Executable()
	if err != nil {
		return "", false
	}
	return installDir(registry.CURRENT_USER, datadirs.UninstallPath, buildinfo.UninstallKeys[buildinfo.Channel], exe)
}

func installDir(base registry.Key, path, key, exe string) (string, bool) {
	if key == "" {
		return "", false
	}
	s, err := datadirs.UninstallString(base, path, key)
	if err != nil || s == "" {
		return "", false
	}
	dir := filepath.Dir(strings.Trim(s, `"`))
	rel, err := filepath.Rel(dir, exe)
	if err != nil || rel == ".." || strings.HasPrefix(rel, `..\`) || filepath.IsAbs(rel) {
		return "", false
	}
	return dir, true
}

// UninstallService is bound.
type UninstallService struct {
	Busy *busy.Registry
	Quit func()
}

type Target struct {
	Removable bool `json:"removable"`
}

func (s *UninstallService) Removable() Target {
	_, ok := InstallDir()
	return Target{ok}
}

// Start launches the helper and quits; the helper waits for this process to exit first.
func (s *UninstallService) Start() error {
	if reason := s.Busy.QuitBlocker(); reason != "" {
		return errors.New(reason)
	}
	dir, ok := InstallDir()
	if !ok {
		return errors.New("VexWave can only uninstall an installed copy of itself, and this one is running from a development build.")
	}
	// ponytail: the helper copy stays in %TEMP%, since a running exe can't delete itself; Windows' temp cleanup takes it.
	helper, err := copySelf(filepath.Join(os.TempDir(), "vexwave-uninstall-"+rand.Text()+".exe"))
	if err != nil {
		return errors.New("The uninstaller couldn't start, so nothing was removed.")
	}
	if err := spawnDetached(exec.Command(helper, "--uninstall-helper", strconv.Itoa(os.Getpid()), dir)); err != nil {
		os.Remove(helper)
		return errors.New("The uninstaller couldn't start, so nothing was removed.")
	}
	time.AfterFunc(quitDelay, s.Quit)
	return nil
}

func copySelf(dst string) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	in, err := os.Open(exe)
	if err != nil {
		return "", err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o755)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return "", err
	}
	return dst, out.Close()
}

// spawnDetached keeps the child alive after the app exits, even when the app runs in a
// kill-on-close job; a job that forbids breakaway refuses the flag, so it retries without.
func spawnDetached(cmd *exec.Cmd) error {
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

// Helper is the --uninstall-helper mode: wait for the app to exit, then run the NSIS uninstaller.
func Helper(pid, dir string) error {
	n, err := strconv.ParseUint(pid, 10, 32)
	if err != nil {
		return err
	}
	if h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(n)); err == nil {
		windows.WaitForSingleObject(h, uint32(exitWait/time.Millisecond))
		windows.CloseHandle(h)
	}
	return exec.Command(filepath.Join(dir, "uninstall.exe"), "/S").Run()
}

// RemoveData is the --remove-data mode the NSIS uninstaller runs: it applies the uninstall rule to this channel.
func RemoveData() error {
	var others []string
	for ch, key := range buildinfo.UninstallKeys {
		if ch != buildinfo.Channel {
			others = append(others, key)
		}
	}
	return datadirs.Default().RemoveData(buildinfo.Channel, others, func(key string) (bool, error) {
		return datadirs.Installed(registry.CURRENT_USER, datadirs.UninstallPath, key)
	})
}
