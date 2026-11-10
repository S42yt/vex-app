package buildinfo

import (
	"fmt"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

var Version = func() string {
	exe, err := os.Executable()
	if err != nil {
		return "0.0.0"
	}
	return fileVersion(exe)
}()

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
