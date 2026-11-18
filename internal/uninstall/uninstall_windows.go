package uninstall

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/VexWave/vex-app/internal/buildinfo"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/platform"
	"golang.org/x/sys/windows/registry"
)

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

func Helper(pid, dir string) error {
	if err := platform.WaitExit(pid); err != nil {
		return err
	}
	return exec.Command(filepath.Join(dir, "uninstall.exe"), "/S").Run()
}

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
