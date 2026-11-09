package main

import (
	"embed"
	"log"
	"os"

	"github.com/VexWave/vex-app/internal/binaries"
	"github.com/VexWave/vex-app/internal/buildinfo"
	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/library"
	"github.com/VexWave/vex-app/internal/media"
	"github.com/VexWave/vex-app/internal/session"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

const trackCacheBytes = 256 << 20

func main() {
	layout := datadirs.Default()
	store := &session.Store{}
	busyRegistry := &busy.Registry{}
	binaryService := &binaries.BinaryService{Bin: layout.Bin(), Busy: busyRegistry, Proxy: func() string {
		if cur, ok := store.Current(); ok {
			return cur.Proxy
		}
		return ""
	}}
	mediaSession := &session.MediaSession{Store: store}
	mediaServer := media.New(mediaSession, trackCacheBytes)
	if err := mediaServer.Start(); err != nil {
		log.Fatal(err)
	}
	defer mediaServer.Close()

	// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS has no effect on a Wails app; the args go through its options.
	var browserArgs []string
	if port := os.Getenv("VEXWAVE_CDP_PORT"); port != "" && buildinfo.Channel == "dev" {
		browserArgs = []string{"--remote-debugging-port=" + port}
	}

	var window *application.WebviewWindow
	app := application.New(application.Options{
		Name:        "VexWave",
		Description: "A desktop music player",
		Services: []application.Service{
			application.NewService(&session.SessionService{Store: store}),
			application.NewService(&library.LibraryService{Store: store, URLs: mediaServer}),
			application.NewService(binaryService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Windows: application.WindowsOptions{
			WebviewUserDataPath:   layout.Webview(buildinfo.Channel),
			AdditionalBrowserArgs: browserArgs,
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "app.vexwave." + buildinfo.Channel,
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if window != nil {
					window.Restore()
					window.Focus()
				}
			},
		},
	})
	mediaSession.Events = app.Event
	binaryService.Events = app.Event

	window = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "VexWave",
		Width:            1200,
		Height:           800,
		BackgroundColour: application.NewRGB(10, 10, 10),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
