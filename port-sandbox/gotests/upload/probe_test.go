package upload

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

const fixtures = "../../fixtures"

// Compares Probe against music-metadata (what UploadService.ts uses today),
// read through ../../fixtures/mm.ts with bun.
func TestProbeMatchesMusicMetadata(t *testing.T) {
	mm, err := exec.Command("bun", filepath.Join(fixtures, "mm.ts")).Output()
	if err != nil {
		t.Fatalf("bun mm.ts: %v", err)
	}
	var want map[string]struct {
		Title      *string `json:"title"`
		DurationMs *int    `json:"durationMs"`
		CoverBytes int     `json:"coverBytes"`
		Format     *string `json:"format"`
	}
	json.Unmarshal(mm, &want)
	cover, _ := os.ReadFile(filepath.Join(fixtures, "cover.jpg"))
	for _, name := range []string{"tagged.mp3", "tagged.m4a", "tagged.flac", "untagged.ogg"} {
		got, err := Probe(context.Background(), "ffprobe", "ffmpeg", filepath.Join(fixtures, name))
		if err != nil {
			t.Fatal(err)
		}
		w := want[name]
		wt := "(none: filename fallback)"
		if w.Title != nil {
			wt = *w.Title
		}
		wd := -1
		if w.DurationMs != nil {
			wd = *w.DurationMs
		}
		t.Logf("%-13s ffprobe title=%q dur=%dms cover=%dB | music-metadata title=%q dur=%dms cover=%dB", name, got.Title, got.DurationMs, len(got.Cover), wt, wd, w.CoverBytes)
		if w.Title != nil && got.Title != *w.Title {
			t.Errorf("%s title differs", name)
		}
		if diff := got.DurationMs - wd; diff < -100 || diff > 100 {
			t.Errorf("%s duration differs by %d ms", name, diff)
		}
		if len(got.Cover) != w.CoverBytes {
			t.Errorf("%s cover %d vs %d bytes", name, len(got.Cover), w.CoverBytes)
		}
		if name == "tagged.mp3" && !bytes.Equal(got.Cover, cover) {
			t.Errorf("cover bytes differ from the embedded file")
		}
	}
}
