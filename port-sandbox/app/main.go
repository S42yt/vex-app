package main

import (
	"embed"
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Launched through explorer.exe to see the job a user-started copy runs in.
	if len(os.Args) > 1 && os.Args[1] == "--job-out" {
		b, _ := json.Marshal(jobInfo())
		os.WriteFile(filepath.Join(os.TempDir(), "probe-job.json"), b, 0o644)
		return
	}

	var browserArgs []string
	if port := os.Getenv("PROBE_CDP_PORT"); port != "" {
		browserArgs = append(browserArgs, "--remote-debugging-port="+port)
	}
	probe := &ProbeService{}
	opts := application.Options{
		Name: "probe",
		Services: []application.Service{
			application.NewService(probe),
			application.NewServiceWithOptions(&SlowRoute{}, application.ServiceOptions{Route: "/slow"}),
		},
		Assets: application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Windows: application.WindowsOptions{
			AdditionalBrowserArgs: browserArgs,
			WebviewUserDataPath:   os.Getenv("PROBE_UDP"),
		},
	}
	if os.Getenv("PROBE_SINGLE") != "" {
		opts.SingleInstance = &application.SingleInstanceOptions{
			UniqueID: "com.example.probe.single",
			OnSecondInstanceLaunch: func(d application.SecondInstanceData) {
				b, _ := json.Marshal(d)
				os.WriteFile(filepath.Join(os.TempDir(), "probe-second.json"), b, 0o644)
			},
		}
	}
	app := application.New(opts)
	probe.app = app
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "probe",
		Width:  1000,
		Height: 700,
		URL:    "/",
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
