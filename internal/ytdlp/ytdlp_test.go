package ytdlp

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/VexWave/vex-app/internal/ytdlp/ytdlptest"
)

func TestProxyReplacesInheritedOnes(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://inherited:1")
	t.Setenv("ALL_PROXY", "http://inherited:2")
	t.Setenv("NO_PROXY", "intranet")
	cmd := Command(context.Background(), `C:\bin`, "http://user:pw@proxy:8080")
	var proxies []string
	for _, kv := range cmd.Env {
		if k, _, _ := strings.Cut(kv, "="); strings.HasSuffix(strings.ToLower(k), "_proxy") {
			proxies = append(proxies, kv)
		}
	}
	slices.Sort(proxies)
	want := []string{"NO_PROXY=intranet", "http_proxy=http://user:pw@proxy:8080", "https_proxy=http://user:pw@proxy:8080"}
	if !slices.Equal(proxies, want) {
		t.Fatalf("%v", proxies)
	}
	if cmd.Args[1] != "--encoding" || cmd.Args[2] != "UTF-8" {
		t.Fatalf("args %v", cmd.Args)
	}
}

func TestFailureNamesTheErrorLine(t *testing.T) {
	cmd := Command(context.Background(), ytdlptest.Bin(t), "", "https://example.com/fail")
	var stderr Tail
	cmd.Stderr = &stderr
	err := cmd.Run()
	if got := Failure(err, stderr.String()); got != "[generic] https://example.com/fail: Unsupported URL" {
		t.Fatalf("%q", got)
	}
	if got := Failure(errors.New("x"), "\r\nlast words\r\n\r\n"); got != "last words" {
		t.Fatalf("%q", got)
	}
}

func TestCleanArtistName(t *testing.T) {
	for in, want := range map[string]string{"Daft Punk - Topic": "Daft Punk", "NA": "", " Björk ": "Björk", "x -topic": "x"} {
		if got := CleanArtistName(in); got != want {
			t.Errorf("%q → %q", in, got)
		}
	}
	for in, want := range map[string]int64{"12.6": 13, "NA": 0, "-1": 0, "NaN": 0} {
		if got := Number(in); got != want {
			t.Errorf("Number(%q) = %d", in, got)
		}
	}
}
