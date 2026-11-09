package main

import (
	"context"
	"os"
	"os/exec"

	"github.com/VexWave/vex-app/internal/platform"
)

func main() {
	child, out := os.Args[1], os.Args[2]
	plain := exec.Command(child, out+".plain")
	plain.Run()
	platform.Command(context.Background(), "", child, out+".nowindow").Run()
}
