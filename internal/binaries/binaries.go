package binaries

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/events"
	"github.com/VexWave/vex-app/internal/netx"
	"github.com/VexWave/vex-app/internal/platform"
	"github.com/ulikunitz/xz"
)

type Name string

const (
	YtDlp  Name = "ytDlp"
	FFmpeg Name = "ffmpeg"
	Deno   Name = "deno"
)

var all = []Name{YtDlp, FFmpeg, Deno}

type file struct{ entry, dest string }

type archive int

const (
	raw archive = iota
	zipped
	tarXz
)

type part struct {
	url     string
	archive archive
	files   []file
}

type installed struct {
	Installed bool `json:"installed"`
}

type ytDlpEntry struct {
	Version string `json:"version,omitempty"`
}

type manifest struct {
	YtDlp  *ytDlpEntry `json:"ytDlp,omitempty"`
	FFmpeg *installed  `json:"ffmpeg,omitempty"`
	Deno   *installed  `json:"deno,omitempty"`
}

func (m *manifest) has(n Name) bool {
	switch n {
	case YtDlp:
		return m.YtDlp != nil
	case FFmpeg:
		return m.FFmpeg != nil
	default:
		return m.Deno != nil
	}
}

type BinaryService struct {
	Bin    string
	Busy   *busy.Registry
	Events events.Emitter
	Proxy  func() string
}

type Status struct {
	Installed    []Name `json:"installed"`
	Missing      []Name `json:"missing"`
	YtDlpVersion string `json:"ytDlpVersion,omitempty"`
}

func (b *BinaryService) GetBinaryStatus() *Status {
	m := b.readManifest()
	st := &Status{Installed: []Name{}, Missing: []Name{}}
	for _, n := range all {
		ok := m.has(n)
		for _, p := range parts(n) {
			for _, f := range p.files {
				if fi, err := os.Stat(filepath.Join(b.Bin, f.dest)); err != nil || !fi.Mode().IsRegular() {
					ok = false
				}
			}
		}
		if ok {
			st.Installed = append(st.Installed, n)
		} else {
			st.Missing = append(st.Missing, n)
		}
	}
	if slices.Contains(st.Installed, YtDlp) {
		st.YtDlpVersion = m.YtDlp.Version
	}
	return st
}

type ProxyParams struct {
	ProxyURL string `json:"proxyUrl,omitempty"`
}

func (b *BinaryService) InstallMissingBinaries(p ProxyParams) error {
	return b.start(nil, p.ProxyURL, true)
}

func (b *BinaryService) UpdateYtDlp() error {
	return b.start([]Name{YtDlp}, b.Proxy(), false)
}

func (b *BinaryService) start(names []Name, proxy string, wait bool) error {
	release, err := b.Busy.Acquire(busy.Install)
	if errors.Is(err, busy.ErrInstalling) {
		return nil
	}
	if err != nil {
		return err
	}
	go func() {
		defer release()
		b.run(names, proxy, wait)
	}()
	return nil
}

func (b *BinaryService) run(names []Name, proxy string, wait bool) {
	current := YtDlp
	if len(names) > 0 {
		current = names[0]
	}
	err := func() error {
		unlock, err := datadirs.LockBin(b.Bin, true, wait)
		if err != nil {
			return err
		}
		defer unlock()
		tmp := filepath.Join(b.Bin, ".tmp")
		os.RemoveAll(tmp)
		if err := os.MkdirAll(tmp, 0o755); err != nil {
			return err
		}
		defer os.RemoveAll(tmp)
		if names == nil {
			names = b.GetBinaryStatus().Missing
		}
		for _, n := range names {
			current = n
			if err := b.installOne(n, tmp, proxy); err != nil {
				return err
			}
			b.Events.Emit(events.BinariesInstalled, events.BinaryInstalled{Binary: string(n)})
		}
		return nil
	}()
	if err != nil {
		b.Events.Emit(events.BinariesFailed, events.BinaryFailed{Binary: string(current), Error: err.Error()})
		return
	}
	b.Events.Emit(events.BinariesFinished, events.BinariesDone{})
}

func (b *BinaryService) installOne(n Name, tmp, proxy string) error {
	ps := parts(n)
	for i, p := range ps {
		dl := filepath.Join(tmp, fmt.Sprintf("%s-%d.download", n, i+1))
		progress := func(received, total int64, step string) {
			b.Events.Emit(events.BinariesProgress, events.BinaryProgress{
				Binary: string(n), Step: step, ReceivedBytes: received, TotalBytes: total, Part: i + 1, PartCount: len(ps),
			})
		}
		if err := download(p.url, dl, proxy, func(r, t int64) { progress(r, t, "downloading") }); err != nil {
			return err
		}
		if p.archive == raw {
			if err := os.Rename(dl, filepath.Join(b.Bin, p.files[0].dest)); err != nil {
				return err
			}
			continue
		}
		progress(0, 0, "extracting")
		if err := extract(dl, p.archive, p.files, b.Bin); err != nil {
			return err
		}
	}
	m := b.readManifest()
	switch n {
	case YtDlp:
		m.YtDlp = &ytDlpEntry{b.ytDlpVersion()}
	case FFmpeg:
		m.FFmpeg = &installed{true}
	default:
		m.Deno = &installed{true}
	}
	return b.writeManifest(m)
}

func (b *BinaryService) ytDlpVersion() string {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out, err := platform.Command(ctx, b.Bin, filepath.Join(b.Bin, platform.Exe("yt-dlp")), "--version").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

const progressEvery = 150 * time.Millisecond

func download(url, target, proxy string, progress func(received, total int64)) error {
	res, err := netx.For(proxy).Stream.Get(url)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("Download failed (HTTP %d): %s", res.StatusCode, url)
	}
	total := max(res.ContentLength, 0)
	f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer f.Close()
	var received int64
	last := time.Time{}
	buf := make([]byte, 256<<10)
	progress(0, total)
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			if _, err := f.Write(buf[:n]); err != nil {
				return err
			}
			received += int64(n)
			if time.Since(last) >= progressEvery {
				last = time.Now()
				progress(received, total)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return rerr
		}
	}
	progress(received, total)
	return f.Close()
}

func extract(path string, a archive, files []file, bin string) error {
	if a == tarXz {
		return extractTarXz(path, files, bin)
	}
	return extractZip(path, files, bin)
}

func extractZip(zipPath string, files []file, bin string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer zr.Close()
	for _, want := range files {
		zf, err := zr.Open(want.entry)
		if err != nil {
			return fmt.Errorf("%s missing from %s", want.entry, filepath.Base(zipPath))
		}
		err = writeExe(zf, filepath.Join(bin, want.dest))
		zf.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func extractTarXz(path string, files []file, bin string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	xr, err := xz.NewReader(bufio.NewReader(f))
	if err != nil {
		return err
	}
	dests := map[string]string{}
	for _, want := range files {
		dests[want.entry] = want.dest
	}
	tr := tar.NewReader(xr)
	for len(dests) > 0 {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		dest, ok := dests[h.Name]
		if !ok || h.Typeflag != tar.TypeReg {
			continue
		}
		if err := writeExe(tr, filepath.Join(bin, dest)); err != nil {
			return err
		}
		delete(dests, h.Name)
	}
	for _, want := range files {
		if _, ok := dests[want.entry]; ok {
			return fmt.Errorf("%s missing from %s", want.entry, filepath.Base(path))
		}
	}
	return nil
}

func writeExe(r io.Reader, dest string) error {
	tmp := dest + ".new"
	out, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err == nil {
		_, err = io.Copy(out, r)
		if cerr := out.Close(); err == nil {
			err = cerr
		}
	}
	if err == nil {
		err = os.Rename(tmp, dest)
	}
	if err != nil {
		os.Remove(tmp)
	}
	return err
}

func (b *BinaryService) manifestPath() string { return filepath.Join(b.Bin, "manifest.json") }

func (b *BinaryService) readManifest() *manifest {
	m := &manifest{}
	if data, err := os.ReadFile(b.manifestPath()); err == nil {
		json.Unmarshal(data, m)
	}
	return m
}

func (b *BinaryService) writeManifest(m *manifest) error {
	data, err := json.MarshalIndent(m, "", "\t")
	if err != nil {
		return err
	}
	tmp := b.manifestPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, b.manifestPath())
}

type YtDlpUpdate struct {
	UpdateAvailable  bool   `json:"updateAvailable"`
	LatestVersion    string `json:"latestVersion,omitempty"`
	InstalledVersion string `json:"installedVersion,omitempty"`
}

const ytDlpLatest = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"

func (b *BinaryService) CheckYtDlpUpdate(ctx context.Context) YtDlpUpdate {
	m := b.readManifest()
	if m.YtDlp == nil || m.YtDlp.Version == "" {
		return YtDlpUpdate{}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ytDlpLatest, nil)
	if err != nil {
		return YtDlpUpdate{}
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := netx.For(b.Proxy()).API.Do(req)
	if err != nil {
		return YtDlpUpdate{}
	}
	defer res.Body.Close()
	var rel struct {
		Tag string `json:"tag_name"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&rel) != nil || rel.Tag == "" || rel.Tag == m.YtDlp.Version {
		return YtDlpUpdate{}
	}
	return YtDlpUpdate{UpdateAvailable: true, LatestVersion: rel.Tag, InstalledVersion: m.YtDlp.Version}
}
