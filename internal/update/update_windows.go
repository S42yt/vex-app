package update

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"github.com/VexWave/vex-app/internal/platform"
)

const installWait = 5 * time.Minute

func Helper(pid, installer, exe string) error {
	if err := platform.WaitExit(pid); err != nil {
		return err
	}
	installErr := install(installer, exe)
	app := exec.Command(exe)
	if err := app.Start(); err != nil {
		return errors.Join(installErr, err)
	}
	app.Process.Release()
	return installErr
}

func install(installer, exe string) error {
	backup := exe + ".old"
	os.Remove(backup)
	if err := platform.CopyFile(exe, backup); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), installWait)
	defer cancel()
	cmd := exec.CommandContext(ctx, installer)
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `"` + installer + `" /S /D=` + filepath.Dir(exe)}
	if err := cmd.Run(); err != nil {
		return errors.Join(err, os.Rename(backup, exe))
	}
	return os.Remove(backup)
}
