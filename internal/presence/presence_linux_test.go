package presence

import (
	"net"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func testPrefix(t *testing.T, name string) string {
	dir, err := os.MkdirTemp("", "vexwave")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	return filepath.Join(dir, name+"-")
}

func listenPipe(name string) (net.Listener, error) { return net.Listen("unix", name) }

func TestPipePrefixes(t *testing.T) {
	t.Setenv("XDG_RUNTIME_DIR", "/run/user/1000")
	want := []string{"/run/user/1000/discord-ipc-", "/run/user/1000/app/com.discordapp.Discord/discord-ipc-", "/run/user/1000/snap.discord/discord-ipc-"}
	if got := pipePrefixes(); !slices.Equal(got, want) {
		t.Fatal(got)
	}
}
