package main

import (
	"context"
	"embed"
	"log"
	"os"

	"github.com/VexWave/vex-app/internal/binaries"
	"github.com/VexWave/vex-app/internal/buildinfo"
	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/download"
	"github.com/VexWave/vex-app/internal/importer"
	"github.com/VexWave/vex-app/internal/library"
	"github.com/VexWave/vex-app/internal/media"
	"github.com/VexWave/vex-app/internal/presence"
	"github.com/VexWave/vex-app/internal/search"
	"github.com/VexWave/vex-app/internal/session"
	"github.com/VexWave/vex-app/internal/uninstall"
	"github.com/VexWave/vex-app/internal/update"
	"github.com/VexWave/vex-app/internal/upload"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

const trackCacheBytes = 256 << 20

func main() {
	// The installer and the uninstall helper run these modes; they must stay clear of SingleInstance.
	if len(os.Args) > 1 {
		switch {
		case os.Args[1] == "--remove-data":
			if err := uninstall.RemoveData(); err != nil {
				log.Fatal(err)
			}
			return
		case os.Args[1] == "--uninstall-helper" && len(os.Args) == 4:
			if err := uninstall.Helper(os.Args[2], os.Args[3]); err != nil {
				log.Fatal(err)
			}
			return
		}
	}

	layout := datadirs.Default()
	store := &session.Store{}
	busyRegistry := &busy.Registry{}
	proxy := func() string {
		if cur, ok := store.Current(); ok {
			return cur.Proxy
		}
		return ""
	}
	binaryService := &binaries.BinaryService{Bin: layout.Bin(), Busy: busyRegistry, Proxy: proxy}
	presenceService := &presence.PresenceService{BaseURL: func() string {
		if cur, ok := store.Current(); ok {
			return cur.BaseURL
		}
		return ""
	}}
	mediaSession := &session.MediaSession{Store: store}
	mediaServer := media.New(mediaSession, trackCacheBytes)
	uploads := &upload.UploadService{Bin: layout.Bin(), Busy: busyRegistry, Store: store, CoverURL: mediaServer.StagedCoverURL}
	mediaServer.Staged = uploads
	imports := &importer.ImportService{
		Dir: layout.Imports(buildinfo.Channel), Bin: layout.Bin(), Busy: busyRegistry, Proxy: proxy,
		Stage: func(ctx context.Context, path string) (upload.Staged, error) {
			staged, err := uploads.Stage(ctx, []string{path}, true)
			if err != nil {
				return upload.Staged{}, err
			}
			return staged[0], nil
		},
	}
	if err := mediaServer.Start(); err != nil {
		log.Fatal(err)
	}
	defer mediaServer.Close()

	// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS has no effect on a Wails app; the args go through its options.
	var browserArgs []string
	if port := os.Getenv("VEXWAVE_CDP_PORT"); port != "" && buildinfo.Channel == "dev" {
		browserArgs = []string{"--remote-debugging-port=" + port}
	}

	updates := &update.UpdateService{Busy: busyRegistry, Installed: func() bool { _, ok := uninstall.InstallDir(); return ok }}
	uninstaller := &uninstall.UninstallService{Busy: busyRegistry}

	// Border and text mirror --border and --foreground in index.css; the caption sits above --card so it reads apart from the header.
	caption := &application.WindowTheme{
		TitleBarColour:  application.NewRGBPtr(0x1c, 0x1c, 0x1c),
		BorderColour:    application.NewRGBPtr(0x26, 0x26, 0x26),
		TitleTextColour: application.NewRGBPtr(0xfa, 0xfa, 0xfa),
	}

	var window *application.WebviewWindow
	app := application.New(application.Options{
		Name:        "VexWave",
		Description: "A desktop music player",
		Services: []application.Service{
			application.NewService(&session.SessionService{Store: store}),
			application.NewService(&library.LibraryService{Store: store, URLs: mediaServer}),
			application.NewService(binaryService),
			application.NewService(uploads),
			application.NewService(&download.DownloadService{Busy: busyRegistry, Tracks: mediaServer}),
			application.NewService(imports),
			application.NewService(&search.SearchService{Bin: layout.Bin(), Busy: busyRegistry, Proxy: proxy}),
			application.NewService(presenceService),
			application.NewService(updates),
			application.NewService(uninstaller),
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
	imports.Events = app.Event
	presenceService.Events = app.Event
	uninstaller.Quit = app.Quit
	if buildinfo.Channel != "canary" {
		if err := update.Configure(app.Updater, buildinfo.Version, proxy); err != nil {
			log.Fatal(err)
		}
		updates.Updater = app.Updater
	}

	window = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "VexWave",
		Width:            1200,
		Height:           800,
		BackgroundColour: application.NewRGB(10, 10, 10),
		URL:              "/",
		Windows: application.WindowsWindow{
			Theme:       application.Dark,
			CustomTheme: application.ThemeSettings{DarkModeActive: caption, DarkModeInactive: caption},
		},
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
