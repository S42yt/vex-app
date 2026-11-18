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

func managedBin(t *testing.T) string {
	bin := datadirs.Default().Bin()
	if _, err := os.Stat(filepath.Join(bin, platform.Exe("ffprobe"))); err != nil {
		t.Skip("no managed ffprobe")
	}
	if _, err := os.Stat(filepath.Join("testdata", "tagged.mp3")); err != nil {
		out, err := platform.Command(context.Background(), bin, "sh", filepath.Join("testdata", "gen.sh")).CombinedOutput()
		if err != nil {
			t.Fatalf("testdata/gen.sh: %v\n%s", err, out)
		}
	}
	return bin
}

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

func withCover(t *testing.T, bin string, size int) string {
	cover, err := os.ReadFile(filepath.Join("testdata", "cover.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	img, track := filepath.Join(dir, "cover.jpg"), filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(img, append(cover, make([]byte, size-len(cover))...), 0o644); err != nil {
		t.Fatal(err)
	}
	// image2 keeps the whole file as one packet; jpeg_pipe would cut the padding at the JPEG's end marker.
	out, err := platform.Command(context.Background(), bin, filepath.Join(bin, platform.Exe("ffmpeg")),
		"-v", "error", "-f", "lavfi", "-i", "sine=duration=1", "-f", "image2", "-i", img,
		"-map", "0:a", "-map", "1:v", "-c:a", "libmp3lame", "-c:v", "copy", "-disposition:v", "attached_pic", track).CombinedOutput()
	if err != nil {
		t.Fatalf("ffmpeg: %v\n%s", err, out)
	}
	return track
}

func TestProbeDropsOversizedCover(t *testing.T) {
	bin := managedBin(t)
	for _, c := range []struct {
		size int
		kept bool
	}{{MaxImageBytes, true}, {MaxImageBytes + 1, false}} {
		got, err := probe(context.Background(), bin, withCover(t, bin, c.size))
		if err != nil {
			t.Fatal(err)
		}
		if kept := got.Cover != nil; kept != c.kept || kept && len(got.Cover) != c.size {
			t.Errorf("%d-byte cover: got %d bytes", c.size, len(got.Cover))
		}
	}
}

func TestStageServesCover(t *testing.T) {
	bin := managedBin(t)
	u := &UploadService{Bin: bin, CoverURL: func(id string) string { return "L/" + id }}
	got, err := u.Stage(context.Background(), []string{filepath.Join("testdata", "tagged.mp3"), filepath.Join("testdata", "cover.jpg")}, false)
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
