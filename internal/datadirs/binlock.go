package datadirs

import (
	"errors"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

var ErrBinBusy = errors.New("another VexWave window is using or updating the tools — try again when it's done")

func LockBin(bin string, exclusive, wait bool) (release func(), err error) {
	if err := os.MkdirAll(bin, 0o755); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(bin, ".lock"), os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		return nil, err
	}
	var flags uint32
	if exclusive {
		flags |= windows.LOCKFILE_EXCLUSIVE_LOCK
	}
	if !wait {
		flags |= windows.LOCKFILE_FAIL_IMMEDIATELY
	}
	ol := new(windows.Overlapped)
	if err := windows.LockFileEx(windows.Handle(f.Fd()), flags, 0, 1, 0, ol); err != nil {
		f.Close()
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
			return nil, ErrBinBusy
		}
		return nil, err
	}
	return func() {
		windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, ol)
		f.Close()
	}, nil
}
