package main

import (
	"log"

	"github.com/VexWave/vex-app/internal/buildinfo"
	"github.com/VexWave/vex-app/internal/update"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func configureUpdates(app *application.App, updates *update.UpdateService, proxy func() string) {
	if buildinfo.Channel == "canary" {
		return
	}
	if err := update.Configure(app.Updater, buildinfo.Version, proxy); err != nil {
		log.Fatal(err)
	}
	updates.Updater = app.Updater
}
