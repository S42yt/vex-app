package platform

import (
	"context"
	"os"
	"os/exec"
)

func Exe(name string) string { return name }

func Command(ctx context.Context, bin, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = append(os.Environ(), "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	return cmd
}
