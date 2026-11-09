package buildinfo

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestFileVersion(t *testing.T) {
	notepad := filepath.Join(os.Getenv("SystemRoot"), "System32", "notepad.exe")
	if v := fileVersion(notepad); !regexp.MustCompile(`^[1-9]\d*\.\d+\.\d+$`).MatchString(v) {
		t.Fatalf("notepad.exe: %q", v)
	}
	if v := Version; v != "0.0.0" {
		t.Fatalf("the test binary has no version resource, got %q", v)
	}
}
