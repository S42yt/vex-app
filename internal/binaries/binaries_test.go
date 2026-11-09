package binaries

import (
	"archive/zip"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestExtractAndStatus(t *testing.T) {
	bin := t.TempDir()
	b := &BinaryService{Bin: bin}
	if st := b.GetBinaryStatus(); len(st.Missing) != 3 || len(st.Installed) != 0 {
		t.Fatalf("empty dir: %+v", st)
	}

	zipPath := filepath.Join(t.TempDir(), "ffmpeg.zip")
	f, _ := os.Create(zipPath)
	zw := zip.NewWriter(f)
	for _, name := range []string{"pkg/bin/ffmpeg.exe", "pkg/bin/ffprobe.exe", "pkg/doc.txt"} {
		w, _ := zw.Create(name)
		w.Write([]byte(name))
	}
	zw.Close()
	f.Close()
	if err := extract(zipPath, []file{{"pkg/bin/ffmpeg.exe", "ffmpeg.exe"}, {"pkg/bin/ffprobe.exe", "ffprobe.exe"}}, bin); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(filepath.Join(bin, "ffprobe.exe")); string(got) != "pkg/bin/ffprobe.exe" {
		t.Fatal(string(got))
	}
	if err := extract(zipPath, []file{{"pkg/bin/deno.exe", "deno.exe"}}, bin); err == nil {
		t.Fatal("a missing entry extracted")
	}

	if st := b.GetBinaryStatus(); slices.Contains(st.Installed, FFmpeg) {
		t.Fatal("installed without a manifest entry")
	}
	m := b.readManifest()
	m.FFmpeg = &installed{true}
	m.YtDlp = &ytDlpEntry{"2026.10.01"}
	if err := b.writeManifest(m); err != nil {
		t.Fatal(err)
	}
	st := b.GetBinaryStatus()
	if !slices.Equal(st.Installed, []Name{FFmpeg}) || !slices.Equal(st.Missing, []Name{YtDlp, Deno}) || st.YtDlpVersion != "" {
		t.Fatalf("%+v", st)
	}
}
