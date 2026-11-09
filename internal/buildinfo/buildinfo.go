// Package buildinfo holds what the build stamps in with -ldflags -X.
package buildinfo

// Channel is "dev", "stable" or "canary"; release builds set it.
var Channel = "dev"
