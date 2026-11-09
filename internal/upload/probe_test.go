package upload

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/platform"
)

// managedBin is the installed tools' folder; the probe tests skip without ffprobe there.
func managedBin(t *testing.T) string {
	bin := datadirs.Default().Bin()
	if _, err := os.Stat(filepath.Join(bin, "ffprobe.exe")); err != nil {
		t.Skip("no managed ffprobe.exe")
	}
	if _, err := os.Stat(filepath.Join("testdata", "tagged.mp3")); err != nil {
		out, err := platform.Command(context.Background(), bin, "sh", filepath.Join("testdata", "gen.sh")).CombinedOutput()
		if err != nil {
			t.Fatalf("testdata/gen.sh: %v\n%s", err, out)
		}
	}
	return bin
}

// The values music-metadata read from the same files in the reference app, within 100 ms.
func TestProbe(t *testing.T) {
	bin := managedBin(t)
	cover, _ := os.ReadFile(filepath.Join("testdata", "cover.jpg"))
	for _, c := range []struct {
		file, title string
		durationMs  int
		cover       []byte
	}{
		{"tagged.mp3", "Café Déjà Vu (Original Mix)", 240039, cover},
		{"tagged.m4a", "M4A Title", 200023, nil},
		{"tagged.flac", "Flac Título", 180000, nil},
		{"untagged.ogg", "untagged", 10000, nil},
	} {
		got, err := probe(context.Background(), bin, filepath.Join("testdata", c.file))
		if err != nil {
			t.Fatal(c.file, err)
		}
		if d := got.DurationMs - c.durationMs; got.Title != c.title || d < -100 || d > 100 || !bytes.Equal(got.Cover, c.cover) {
			t.Errorf("%s: title %q, %d ms, cover %d bytes", c.file, got.Title, got.DurationMs, len(got.Cover))
		}
	}
}

func TestStageServesCover(t *testing.T) {
	bin := managedBin(t)
	u := &UploadService{Bin: bin, CoverURL: func(id string) string { return "L/" + id }}
	got, err := u.Stage(context.Background(), []string{filepath.Join("testdata", "tagged.mp3"), filepath.Join("testdata", "cover.jpg")})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].CoverURL != "L/"+got[0].ID || got[1].Error == "" {
		t.Fatalf("%+v", got)
	}
	if b, ok := u.Cover(got[0].ID); !ok || len(b) == 0 {
		t.Fatal("no staged cover")
	}
	u.Discard([]string{got[0].ID})
	if _, ok := u.Cover(got[0].ID); ok {
		t.Fatal("cover outlived its staged file")
	}
}
