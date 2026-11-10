package binaries

import (
	"archive/tar"
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"

	"github.com/VexWave/vex-app/internal/platform"
	"github.com/ulikunitz/xz"
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
	if err := extract(zipPath, zipped, []file{{"pkg/bin/ffmpeg.exe", platform.Exe("ffmpeg")}, {"pkg/bin/ffprobe.exe", platform.Exe("ffprobe")}}, bin); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(filepath.Join(bin, platform.Exe("ffprobe"))); string(got) != "pkg/bin/ffprobe.exe" {
		t.Fatal(string(got))
	}
	if err := extract(zipPath, zipped, []file{{"pkg/bin/deno.exe", "deno.exe"}}, bin); err == nil {
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

func TestExtractTarXz(t *testing.T) {
	bin := t.TempDir()
	path := filepath.Join(t.TempDir(), "ffmpeg.tar.xz")
	f, _ := os.Create(path)
	xw, _ := xz.NewWriter(f)
	tw := tar.NewWriter(xw)
	tw.WriteHeader(&tar.Header{Name: "pkg/bin/", Typeflag: tar.TypeDir, Mode: 0o755})
	for _, name := range []string{"pkg/doc.txt", "pkg/bin/ffmpeg", "pkg/bin/ffprobe"} {
		tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o755, Size: int64(len(name))})
		tw.Write([]byte(name))
	}
	tw.Close()
	xw.Close()
	f.Close()

	if err := extract(path, tarXz, []file{{"pkg/bin/ffmpeg", "ffmpeg"}, {"pkg/bin/ffprobe", "ffprobe"}}, bin); err != nil {
		t.Fatal(err)
	}
	fi, err := os.Stat(filepath.Join(bin, "ffprobe"))
	if got, _ := os.ReadFile(filepath.Join(bin, "ffprobe")); err != nil || string(got) != "pkg/bin/ffprobe" {
		t.Fatalf("%q %v", got, err)
	}
	if runtime.GOOS != "windows" && fi.Mode().Perm()&0o100 == 0 {
		t.Fatalf("not executable: %v", fi.Mode())
	}
	if err := extract(path, tarXz, []file{{"pkg/bin/ffmpeg", "ffmpeg"}, {"pkg/bin/deno", "deno"}}, bin); err == nil {
		t.Fatal("a missing entry extracted")
	}
}
