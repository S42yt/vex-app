// Package ytdlp starts the managed yt-dlp and reads what it prints.
package ytdlp

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/VexWave/vex-app/internal/platform"
)

// Without --encoding UTF-8, Windows encodes --print output in the console codepage and
// mangles accents. The frozen binary ignores PYTHONIOENCODING, so this flag is the only fix.
var baseArgs = []string{"--encoding", "UTF-8"}

// Command runs bin's yt-dlp through the proxy, if one is set. Callers hold the shared bin lock
// while it runs.
func Command(ctx context.Context, bin, proxy string, args ...string) *exec.Cmd {
	cmd := platform.Command(ctx, bin, filepath.Join(bin, "yt-dlp.exe"), append(append([]string{}, baseArgs...), args...)...)
	if proxy != "" {
		env := cmd.Env[:0:0]
		for _, kv := range cmd.Env {
			k, _, _ := strings.Cut(kv, "=")
			switch strings.ToLower(k) {
			case "http_proxy", "https_proxy", "all_proxy":
				continue
			}
			env = append(env, kv)
		}
		// no_proxy stays: yt-dlp honours it even with an explicit proxy.
		cmd.Env = append(env, "http_proxy="+proxy, "https_proxy="+proxy)
	}
	return cmd
}

const tailBytes = 4000

// Tail keeps the last few KB written to it, for Failure.
type Tail struct{ b []byte }

func (t *Tail) Write(p []byte) (int, error) {
	t.b = append(t.b, p...)
	if len(t.b) > tailBytes {
		t.b = t.b[len(t.b)-tailBytes:]
	}
	return len(p), nil
}

func (t *Tail) String() string { return string(t.b) }

// Failure names why a run failed: yt-dlp's last ERROR: line, else its last line of output.
func Failure(runErr error, stderr string) string {
	lines := strings.Split(stderr, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if line, ok := strings.CutPrefix(strings.TrimRight(lines[i], "\r"), "ERROR:"); ok {
			return strings.TrimSpace(line)
		}
	}
	for i := len(lines) - 1; i >= 0; i-- {
		if line := strings.TrimRight(lines[i], "\r"); strings.TrimSpace(line) != "" {
			return line
		}
	}
	var exit *exec.ExitError
	if errors.As(runErr, &exit) {
		return fmt.Sprintf("yt-dlp exited with code %d", exit.ExitCode())
	}
	if runErr != nil {
		return runErr.Error()
	}
	return "yt-dlp exited with code 0"
}

// Lines calls fn for every line r produces, without its line ending.
func Lines(r io.Reader, fn func(string)) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64<<10), 4<<20)
	for sc.Scan() {
		fn(strings.TrimRight(sc.Text(), "\r"))
	}
	return sc.Err()
}

// CleanField drops yt-dlp's "NA" for a missing field.
func CleanField(s string) string {
	if s = strings.TrimSpace(s); s == "NA" {
		return ""
	}
	return s
}

var topicSuffix = regexp.MustCompile(`(?i)\s*-\s*Topic$`)

// CleanArtistName turns a YouTube "Artist - Topic" channel into the artist's name.
func CleanArtistName(s string) string {
	return strings.TrimSpace(topicSuffix.ReplaceAllString(CleanField(s), ""))
}

// Number reads a positive count yt-dlp printed, rounded; anything else is 0.
func Number(s string) int64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil || math.IsInf(f, 0) || !(f > 0) {
		return 0
	}
	return int64(math.Round(f))
}
