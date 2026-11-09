// Package buildinfo holds what the build decides: the channel (a build tag) and the version
// (the exe's version resource, which wails3 generates from build/config.yml).
package buildinfo

import (
	"fmt"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Channel is "dev", "stable" or "canary"; the stable tag sets it.
var Channel = "dev"

// Version is the exe's product version, or "0.0.0" without a version resource (go run, go test).
var Version = func() string {
	exe, err := os.Executable()
	if err != nil {
		return "0.0.0"
	}
	return fileVersion(exe)
}()

// UninstallKeys maps each installable channel to its HKCU Uninstall key (NSIS UNINST_KEY_NAME).
var UninstallKeys = map[string]string{"stable": "VexWave", "canary": "VexWave Canary"}

func fileVersion(path string) string {
	size, err := windows.GetFileVersionInfoSize(path, nil)
	if err != nil || size == 0 {
		return "0.0.0"
	}
	buf := make([]byte, size)
	if windows.GetFileVersionInfo(path, 0, size, unsafe.Pointer(&buf[0])) != nil {
		return "0.0.0"
	}
	var fixed *windows.VS_FIXEDFILEINFO
	var n uint32
	if windows.VerQueryValue(unsafe.Pointer(&buf[0]), `\`, unsafe.Pointer(&fixed), &n) != nil || n == 0 {
		return "0.0.0"
	}
	return fmt.Sprintf("%d.%d.%d", fixed.ProductVersionMS>>16, fixed.ProductVersionMS&0xffff, fixed.ProductVersionLS>>16)
}
