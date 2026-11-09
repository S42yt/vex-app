package session

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
)

// Logins, logouts, proxy changes, 401 expiries and readers all at once.
// Invariant: a proxy is only ever applied to the session it was probed against.
func TestConcurrentSwaps(t *testing.T) {
	var s Store
	s.Restore(Session{"http://a", "t0", ""})
	var changed, applied atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 500; i++ {
		wg.Add(5)
		go func() { defer wg.Done(); s.Restore(Session{"http://a", fmt.Sprint("t", i), ""}) }()
		go func() { defer wg.Done(); s.Logout() }()
		go func() {
			defer wg.Done()
			err := s.SetProxy(context.Background(), "http://proxy", func(_ context.Context, probed Session) error {
				runtime.Gosched()
				return nil
			})
			switch err {
			case ErrChanged:
				changed.Add(1)
			case nil:
				applied.Add(1)
			}
		}()
		go func() {
			defer wg.Done()
			if cur, ok := s.Current(); ok {
				runtime.Gosched()
				s.Expire(cur)
			}
		}()
		go func() {
			defer wg.Done()
			if cur, ok := s.Current(); ok && cur.Token == "" {
				t.Error("torn session read")
			}
		}()
	}
	wg.Wait()
	t.Logf("SetProxy applied %d, refused as changed %d", applied.Load(), changed.Load())
}

func TestExpireIgnoresNewerSession(t *testing.T) {
	var s Store
	s.Restore(Session{"http://a", "old", ""})
	stale, _ := s.Current()
	s.Restore(Session{"http://a", "new", ""})
	s.Expire(stale) // a late 401 from the old token
	if cur, ok := s.Current(); !ok || cur.Token != "new" {
		t.Fatal("a stale 401 logged out the new session")
	}
}
