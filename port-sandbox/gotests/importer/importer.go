// Package importer models UrlImporter's one-at-a-time queue as a worker goroutine.
package importer

import (
	"context"
	"errors"

	"example.com/gotests/busy"
)

type Job struct{ ID, URL string }

type job struct {
	Job
	release func()
}

type Importer struct {
	busy   *busy.Registry
	jobs   chan job
	run    func(context.Context, Job) error
	report func(id string, err error)
}

var ErrQueueFull = errors.New("Too many imports are queued.")

func New(ctx context.Context, b *busy.Registry, run func(context.Context, Job) error, report func(string, error)) *Importer {
	im := &Importer{busy: b, jobs: make(chan job, 64), run: run, report: report}
	go im.worker(ctx)
	return im
}

// Start holds a busy token from enqueue until the job ends, which is what
// "isActive = running || queued" meant.
func (im *Importer) Start(j Job) error {
	release, err := im.busy.Acquire(busy.Import)
	if err != nil {
		return err
	}
	select {
	case im.jobs <- job{j, release}:
		return nil
	default:
		release()
		return ErrQueueFull
	}
}

func (im *Importer) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case j := <-im.jobs:
			err := im.run(ctx, j.Job)
			j.release()
			im.report(j.ID, err)
		}
	}
}
