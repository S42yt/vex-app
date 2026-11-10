package datadirs

import (
	"errors"
	"os"
	"path/filepath"
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
	unlock, err := lockFile(f, exclusive, wait)
	if err != nil {
		f.Close()
		return nil, err
	}
	return func() {
		unlock()
		f.Close()
	}, nil
}
