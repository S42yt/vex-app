package main

import (
	"github.com/VexWave/vex-app/internal/update"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func configureUpdates(*application.App, *update.UpdateService, func() string) {}
