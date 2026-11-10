package uninstall

import (
	"errors"
	"time"

	"github.com/VexWave/vex-app/internal/busy"
)

const quitDelay = 500 * time.Millisecond

type UninstallService struct {
	Busy *busy.Registry
	Quit func()
}

type Target struct {
	Removable bool `json:"removable"`
}

func (s *UninstallService) Removable() Target {
	_, ok := InstallDir()
	return Target{ok}
}

func (s *UninstallService) Start() error {
	if reason := s.Busy.QuitBlocker(); reason != "" {
		return errors.New(reason)
	}
	dir, ok := InstallDir()
	if !ok {
		return errors.New("VexWave can only uninstall an installed copy of itself, and this one is running from a development build.")
	}
	if err := launchHelper(dir); err != nil {
		return errors.New("The uninstaller couldn't start, so nothing was removed.")
	}
	time.AfterFunc(quitDelay, s.Quit)
	return nil
}
