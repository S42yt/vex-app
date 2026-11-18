package platform

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if marker := os.Getenv("WRITE_MARKER"); marker != "" {
		os.WriteFile(marker, []byte(os.Args[len(os.Args)-1]), 0o644)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestSpawnDetached(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ran")
	cmd := exec.Command(os.Args[0], "-test.run=^$", "detached")
	cmd.Env = append(os.Environ(), "WRITE_MARKER="+marker)
	if err := SpawnDetached(cmd); err != nil {
		t.Fatal(err)
	}
	for range 100 {
		if got, _ := os.ReadFile(marker); string(got) == "detached" {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("the detached child never ran")
}
