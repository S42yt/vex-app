package upload

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// The audio fixtures are git-ignored; generate them on first run.
func TestMain(m *testing.M) {
	if _, err := os.Stat(filepath.Join(fixtures, "tagged.mp3")); err != nil {
		if out, err := exec.Command("sh", filepath.Join(fixtures, "gen.sh")).CombinedOutput(); err != nil {
			fmt.Fprintf(os.Stderr, "fixtures/gen.sh: %v\n%s", err, out)
			os.Exit(1)
		}
	}
	os.Exit(m.Run())
}
