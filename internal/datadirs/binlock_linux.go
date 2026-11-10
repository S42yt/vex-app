package datadirs

import (
	"errors"
	"os"
	"syscall"
)

func lockFile(f *os.File, exclusive, wait bool) (unlock func(), err error) {
	how := syscall.LOCK_SH
	if exclusive {
		how = syscall.LOCK_EX
	}
	if !wait {
		how |= syscall.LOCK_NB
	}
	fd := int(f.Fd())
	for {
		err = syscall.Flock(fd, how)
		if !errors.Is(err, syscall.EINTR) {
			break
		}
	}
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return nil, ErrBinBusy
	}
	if err != nil {
		return nil, err
	}
	return func() { syscall.Flock(fd, syscall.LOCK_UN) }, nil
}
