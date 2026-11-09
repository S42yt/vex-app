package busy

import (
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
)

func TestNaiveCheckThenActOverlaps(t *testing.T) {
	var installing, importing atomic.Int32
	var overlaps atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 2000; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			if installing.Load() == 0 {
				runtime.Gosched()
				importing.Add(1)
				if installing.Load() > 0 {
					overlaps.Add(1)
				}
				importing.Add(-1)
			}
		}()
		go func() {
			defer wg.Done()
			if importing.Load() == 0 {
				runtime.Gosched()
				installing.Add(1)
				if importing.Load() > 0 {
					overlaps.Add(1)
				}
				installing.Add(-1)
			}
		}()
	}
	wg.Wait()
	t.Logf("naive check-then-act: %d overlapping import+install out of 2000 rounds", overlaps.Load())
	if overlaps.Load() == 0 {
		t.Skip("no interleaving observed this run")
	}
}

func TestAcquireNeverOverlaps(t *testing.T) {
	var r Registry
	var importing, installing atomic.Int32
	var overlaps, refused atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 2000; i++ {
		wg.Add(3)
		for _, k := range []Kind{Import, Install, Search} {
			go func() {
				defer wg.Done()
				rel, err := r.Acquire(k)
				if err != nil {
					refused.Add(1)
					return
				}
				defer rel()
				mine, other := &importing, &installing
				if k == Install {
					mine, other = &installing, &importing
				}
				mine.Add(1)
				runtime.Gosched()
				if other.Load() > 0 {
					overlaps.Add(1)
				}
				mine.Add(-1)
			}()
		}
	}
	wg.Wait()
	t.Logf("Acquire: %d overlaps, %d refusals", overlaps.Load(), refused.Load())
	if overlaps.Load() != 0 {
		t.Fatal("install overlapped a yt-dlp user")
	}
	if r.QuitBlocker() != "" {
		t.Fatal("tokens leaked")
	}
}

func TestQuitBlocker(t *testing.T) {
	var r Registry
	rel, _ := r.Acquire(Transfer)
	if r.QuitBlocker() == "" {
		t.Fatal("transfer did not block quit")
	}
	rel()
	rel()
	if r.QuitBlocker() != "" || r.Held(Transfer) != 0 {
		t.Fatal("release")
	}
}
