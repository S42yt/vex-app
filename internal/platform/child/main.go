package main

import (
	"fmt"
	"os"
	"syscall"
)

func main() {
	k := syscall.NewLazyDLL("kernel32.dll").NewProc("GetConsoleWindow")
	u := syscall.NewLazyDLL("user32.dll").NewProc("IsWindowVisible")
	h, _, _ := k.Call()
	vis := uintptr(0)
	if h != 0 {
		vis, _, _ = u.Call(h)
	}
	os.WriteFile(os.Args[1], []byte(fmt.Sprintf("console=%v visible=%v", h != 0, vis != 0)), 0o644)
}
