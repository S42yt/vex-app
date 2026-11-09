package importer

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/upload"
	"github.com/VexWave/vex-app/internal/ytdlp/ytdlptest"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type event struct {
	name string
	data any
}

type recorder chan event

func (r recorder) Emit(name string, data ...any) bool { r <- event{name, data[0]}; return true }

func id(n int) string { return fmt.Sprintf("00000000-0000-4000-8000-%012d", n) }

func service(t *testing.T) (*ImportService, recorder, *[]string) {
	var mu sync.Mutex
	staged := &[]string{}
	ev := make(recorder, 1024)
	s := &ImportService{
		Dir: filepath.Join(t.TempDir(), "imports"), Bin: ytdlptest.Bin(t), Busy: &busy.Registry{},
		Proxy: func() string { return "" }, Events: ev,
		Stage: func(_ context.Context, path string) (upload.Staged, error) {
			mu.Lock()
			defer mu.Unlock()
			*staged = append(*staged, path)
			return upload.Staged{ID: "s" + fmt.Sprint(len(*staged)), FileName: filepath.Base(path), Title: "T"}, nil
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	s.ServiceStartup(ctx, application.ServiceOptions{})
	return s, ev, staged
}

func next(t *testing.T, ev recorder) (event, []string) {
	t.Helper()
	var steps []string
	for {
		select {
		case e := <-ev:
			if e.name == Progress {
				steps = append(steps, e.data.(Step).Step)
				continue
			}
			return e, steps
		case <-time.After(30 * time.Second):
			t.Fatal("no import event")
		}
	}
}

func TestImportStages(t *testing.T) {
	s, ev, staged := service(t)
	if err := s.Start(StartParams{ImportID: id(1), URL: "https://www.youtube.com/watch?v=x"}); err != nil {
		t.Fatal(err)
	}
	e, steps := next(t, ev)
	r, ok := e.data.(Ready)
	if !ok || r.ImportID != id(1) || r.Staged.ID != "s1" || r.Artist == nil || r.Artist.Name != "Imported Artist" || r.Staged.FileName != "Imported Title.mp3" {
		t.Fatalf("%s %+v", e.name, e.data)
	}
	for _, want := range []string{"starting", "downloading", "converting", "staging"} {
		if !slices.Contains(steps, want) {
			t.Fatalf("steps %v miss %s", steps, want)
		}
	}
	if len(*staged) != 1 || filepath.Base((*staged)[0]) != id(1)+".mp3" {
		t.Fatalf("staged %v", *staged)
	}
	for s.Busy.Held(busy.Import) != 0 {
		time.Sleep(time.Millisecond)
	}
}

func TestFailedImportCleansUp(t *testing.T) {
	s, ev, _ := service(t)
	s.Start(StartParams{ImportID: id(1), URL: "https://example.com/fail"})
	e, _ := next(t, ev)
	if f, ok := e.data.(Failure); !ok || f.Error != "[generic] https://example.com/fail: Unsupported URL" {
		t.Fatalf("%s %+v", e.name, e.data)
	}
	if left, _ := filepath.Glob(filepath.Join(s.Dir, id(1)+".*")); left != nil {
		t.Fatalf("left %v", left)
	}
}

func TestQueueOrderAndBusy(t *testing.T) {
	s, ev, staged := service(t)
	for i := range 4 {
		if err := s.Start(StartParams{ImportID: id(i), URL: "https://www.youtube.com/watch?v=" + fmt.Sprint(i)}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Busy.Acquire(busy.Install); err != busy.ErrYtDlpInUse {
		t.Fatalf("install allowed while imports queued: %v", err)
	}
	for i := range 4 {
		if e, _ := next(t, ev); e.data.(Ready).ImportID != id(i) {
			t.Fatalf("job %d finished as %+v", i, e.data)
		}
	}
	if len(*staged) != 4 {
		t.Fatal(*staged)
	}
	for s.Busy.Held(busy.Import) != 0 {
		time.Sleep(time.Millisecond)
	}
	release, err := s.Busy.Acquire(busy.Install)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if err := s.Start(StartParams{ImportID: id(9), URL: "https://x.test/"}); err != busy.ErrInstalling {
		t.Fatalf("import allowed during install: %v", err)
	}
}

func TestShutdownStopsRunningJob(t *testing.T) {
	s, ev, _ := service(t)
	ctx, cancel := context.WithCancel(context.Background())
	s.ServiceStartup(ctx, application.ServiceOptions{})
	s.Start(StartParams{ImportID: id(1), URL: "https://www.youtube.com/slow"})
	time.Sleep(500 * time.Millisecond)
	cancel()
	e, _ := next(t, ev)
	if f, ok := e.data.(Failure); !ok || !strings.Contains(f.Error, context.Canceled.Error()) {
		t.Fatalf("%s %+v", e.name, e.data)
	}
}

func TestStartValidates(t *testing.T) {
	s, _, _ := service(t)
	for _, p := range []StartParams{{ImportID: "x", URL: "https://a.test/"}, {ImportID: id(1), URL: "not a url"}} {
		if err := s.Start(p); err == nil {
			t.Errorf("%+v accepted", p)
		}
	}
}

func TestSweepRemovesStaleFiles(t *testing.T) {
	s, _, _ := service(t)
	os.MkdirAll(s.Dir, 0o755)
	stale, fresh := filepath.Join(s.Dir, "old.mp3"), filepath.Join(s.Dir, "new.mp3")
	os.WriteFile(stale, nil, 0o644)
	os.WriteFile(fresh, nil, 0o644)
	os.Chtimes(stale, time.Now().Add(-2*time.Hour), time.Now().Add(-2*time.Hour))
	s.ServiceStartup(context.Background(), application.ServiceOptions{})
	if _, err := os.Stat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("stale import kept")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("fresh import removed")
	}
}

func TestPickAvatar(t *testing.T) {
	if got := pickAvatar(`[{"url":"a","width":88,"height":88},{"url":"b","width":900,"height":160},{"url":"c","width":176,"height":176}]`); got != "c" {
		t.Fatal(got)
	}
	if got := pickAvatar(`[{"url":"c","width":176,"height":176},{"id":"avatar_uncropped","url":"u"}]`); got != "u" {
		t.Fatal(got)
	}
	if got := aboutURL("https://www.youtube.com/channel/UC1/"); got != "https://www.youtube.com/channel/UC1/about" {
		t.Fatal(got)
	}
	if aboutURL("https://soundcloud.com/x") != "" {
		t.Fatal("non-YouTube channel looked up")
	}
}
