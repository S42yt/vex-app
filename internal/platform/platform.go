// Package platform is the one way the app starts a child process.
package platform

import (
	"context"
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// Command starts name with no console window (a GUI-subsystem parent otherwise gives every
// console child a visible one) and with bin first on PATH, so tools find each other there.
func Command(ctx context.Context, bin, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	// exec keeps the last of case-insensitively equal keys on Windows, so this wins over an inherited Path=.
	cmd.Env = append(os.Environ(), "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	return cmd
}
