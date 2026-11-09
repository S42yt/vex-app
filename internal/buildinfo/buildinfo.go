// Package buildinfo holds what the build stamps in with -ldflags -X.
package buildinfo

// Channel is "dev", "stable" or "canary"; release builds set it.
var Channel = "dev"

// Version is the app version without a "v"; builds set it from build/config.yml.
var Version = "0.0.0"

// UninstallKeys maps each installable channel to its HKCU Uninstall key (NSIS UNINST_KEY_NAME).
var UninstallKeys = map[string]string{"stable": "VexWave", "canary": "VexWave Canary"}
