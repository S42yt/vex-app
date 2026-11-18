package uninstall

import (
	"errors"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/platform"
)

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
	if err := platform.HandOff("--uninstall-helper", s.Quit, dir); err != nil {
		return errors.New("The uninstaller couldn't start, so nothing was removed.")
	}
	return nil
}
