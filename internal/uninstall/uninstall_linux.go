package uninstall

import "errors"

func InstallDir() (string, bool) { return "", false }

func Helper(pid, dir string) error { return errors.ErrUnsupported }

func RemoveData() error { return errors.ErrUnsupported }
