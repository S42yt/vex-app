package platform

import (
	"context"
	"strings"
	"testing"
)

func TestCommandPutsBinFirst(t *testing.T) {
	out, err := Command(context.Background(), `C:\vexwave-bin`, "cmd", "/c", "echo %PATH%").Output()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(strings.TrimSpace(string(out)), `C:\vexwave-bin;`) {
		t.Fatalf("child sees PATH=%s", out)
	}
}
