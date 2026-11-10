package datadirs

import (
	"errors"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const UninstallPath = `Software\Microsoft\Windows\CurrentVersion\Uninstall`

func Default() Layout { return Layout{filepath.Join(os.Getenv("LOCALAPPDATA"), "VexWaveData")} }

func UninstallString(base registry.Key, path, key string) (string, error) {
	k, err := registry.OpenKey(base, path+`\`+key, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer k.Close()
	s, _, err := k.GetStringValue("UninstallString")
	if errors.Is(err, registry.ErrNotExist) {
		return "", nil
	}
	return s, err
}

func Installed(base registry.Key, path, key string) (bool, error) {
	s, err := UninstallString(base, path, key)
	return s != "", err
}
