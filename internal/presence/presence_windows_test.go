package presence

import (
	"crypto/rand"
	"net"
	"testing"

	"github.com/Microsoft/go-winio"
)

func testPrefix(t *testing.T, name string) string {
	return `\\.\pipe\vexwave-` + name + `-` + rand.Text() + `-`
}

func listenPipe(name string) (net.Listener, error) { return winio.ListenPipe(name, nil) }
