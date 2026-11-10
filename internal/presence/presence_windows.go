package presence

import (
	"context"
	"net"

	"github.com/Microsoft/go-winio"
)

func pipePrefixes() []string { return []string{`\\.\pipe\discord-ipc-`} }

func dialPipe(ctx context.Context, name string) (net.Conn, error) {
	return winio.DialPipeContext(ctx, name)
}
