package importer

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/gotests/busy"
)

func TestSerialOrderAndBusy(t *testing.T) {
	var reg busy.Registry
	var running atomic.Int32
	var mu sync.Mutex
	var order []string
	done := make(chan struct{}, 100)
	im := New(context.Background(), &reg, func(ctx context.Context, j Job) error {
		if running.Add(1) != 1 {
			t.Error("two jobs at once")
		}
		time.Sleep(time.Millisecond)
		running.Add(-1)
		return nil
	}, func(id string, err error) {
		mu.Lock()
		order = append(order, id)
		mu.Unlock()
		done <- struct{}{}
	})

	for i := 0; i < 20; i++ {
		if err := im.Start(Job{fmt.Sprint(i), "u"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := reg.Acquire(busy.Install); err != busy.ErrYtDlpInUse {
		t.Fatalf("install allowed while imports queued: %v", err)
	}
	for i := 0; i < 20; i++ {
		<-done
	}
	for i, id := range order {
		if id != fmt.Sprint(i) {
			t.Fatalf("order %v", order)
		}
	}
	time.Sleep(10 * time.Millisecond)
	if reg.Held(busy.Import) != 0 {
		t.Fatal("tokens leaked")
	}
	rel, err := reg.Acquire(busy.Install)
	if err != nil {
		t.Fatal(err)
	}
	if err := im.Start(Job{"x", "u"}); err != busy.ErrInstalling {
		t.Fatalf("import allowed during install: %v", err)
	}
	rel()
}

func TestConcurrentStarts(t *testing.T) {
	var reg busy.Registry
	var n atomic.Int32
	var wg sync.WaitGroup
	im := New(context.Background(), &reg, func(context.Context, Job) error { return nil }, func(string, error) { n.Add(1); wg.Done() })
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			if err := im.Start(Job{fmt.Sprint(i), "u"}); err != nil {
				t.Error(err)
				wg.Done()
			}
		}()
	}
	wg.Wait()
	if n.Load() != 50 {
		t.Fatal(n.Load())
	}
}
