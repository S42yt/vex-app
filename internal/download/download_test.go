package download

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveNamesAndExtension(t *testing.T) {
	dir := t.TempDir()
	flac := "fLaC\x00\x00\x00\x22rest"
	for _, want := range []string{"A_B - T.flac", "A_B - T (2).flac", "A_B - T (3).flac"} {
		path, err := save(strings.NewReader(flac), dir, "A/B - T ")
		if err != nil {
			t.Fatal(err)
		}
		if filepath.Base(path) != want {
			t.Fatalf("saved as %s, want %s", filepath.Base(path), want)
		}
		if b, _ := os.ReadFile(path); string(b) != flac {
			t.Fatal("bytes differ")
		}
	}
	if path, _ := save(strings.NewReader("\x00\x00\x00\x20ftypM4A "), dir, "  "); filepath.Base(path) != "Track.m4a" {
		t.Fatalf("saved as %s", path)
	}
}

type failing struct{}

func (failing) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestFailedSaveLeavesNoFile(t *testing.T) {
	dir := t.TempDir()
	if _, err := save(io.MultiReader(strings.NewReader("ID3"), failing{}), dir, "x"); err == nil {
		t.Fatal("no error")
	}
	if left, _ := os.ReadDir(dir); len(left) != 0 {
		t.Fatalf("left %v", left)
	}
}

// The whole path stays under MAX_PATH in UTF-16 units, with room for " (100)".
func TestFitName(t *testing.T) {
	dir := `C:\` + strings.Repeat("d", 197)
	got := fitName(dir, strings.Repeat("😀", 100), ".mp3")
	if n := utf16Len(dir) + 1 + utf16Len(got) + suffixLen + 4; n > maxPathUnits || n < maxPathUnits-1 {
		t.Fatalf("path is %d units", n)
	}
	if got := fitName(`C:\`, strings.Repeat("é", 200), ".mp3"); len(got)+suffixLen+4 > maxNameBytes {
		t.Fatalf("name is %d bytes", len(got))
	}
}

func TestStartFolderFallsBackWhenGone(t *testing.T) {
	home, _ := os.UserHomeDir()
	dir := t.TempDir()
	file := filepath.Join(dir, "f")
	os.WriteFile(file, nil, 0o644)
	for in, want := range map[string]string{dir: dir, "": home, filepath.Join(dir, "gone"): home, file: home} {
		if got := startFolder(in); got != want {
			t.Errorf("startFolder(%q) = %q, want %q", in, got, want)
		}
	}
}
