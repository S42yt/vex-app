package presence

import (
	"context"
	"net"
	"os"
	"path/filepath"
)

func pipePrefixes() []string {
	dir := "/tmp"
	for _, env := range []string{"XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"} {
		if v := os.Getenv(env); v != "" {
			dir = v
			break
		}
	}
	var out []string
	for _, sub := range []string{"", "app/com.discordapp.Discord", "snap.discord"} {
		out = append(out, filepath.Join(dir, sub, "discord-ipc-"))
	}
	return out
}

func dialPipe(ctx context.Context, name string) (net.Conn, error) {
	var d net.Dialer
	return d.DialContext(ctx, "unix", name)
}
