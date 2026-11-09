// GUI-subsystem parent (built with -H windowsgui, like a Wails app) spawning a console child.
package main

import (
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

func main() {
	child, out := os.Args[1], os.Args[2]
	plain := exec.Command(child, out+".plain")
	plain.Run()
	hidden := exec.Command(child, out+".nowindow")
	hidden.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	hidden.Run()
}
