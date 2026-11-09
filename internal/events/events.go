// Package events registers every event Go pushes to the webview, so the binding
// generator emits typed names and payloads for them.
package events

import "github.com/wailsapp/wails/v3/pkg/application"

const (
	SessionExpired    = "session:expired"
	BinariesProgress  = "binaries:progress"
	BinariesInstalled = "binaries:installed"
	BinariesFinished  = "binaries:finished"
	BinariesFailed    = "binaries:failed"
)

type SessionExpiredData struct {
	Reason string `json:"reason"`
}

type BinaryProgress struct {
	Binary        string `json:"binary"`
	Step          string `json:"step"` // "downloading" | "extracting"
	ReceivedBytes int64  `json:"receivedBytes"`
	TotalBytes    int64  `json:"totalBytes,omitempty"`
	Part          int    `json:"part"`
	PartCount     int    `json:"partCount"`
}

type BinaryInstalled struct {
	Binary string `json:"binary"`
}

type BinariesDone struct{}

type BinaryFailed struct {
	Binary string `json:"binary"`
	Error  string `json:"error"`
}

func init() {
	application.RegisterEvent[SessionExpiredData](SessionExpired)
	application.RegisterEvent[BinaryProgress](BinariesProgress)
	application.RegisterEvent[BinaryInstalled](BinariesInstalled)
	application.RegisterEvent[BinariesDone](BinariesFinished)
	application.RegisterEvent[BinaryFailed](BinariesFailed)
}

// Emitter is the one method of *application.EventManager services need.
type Emitter interface {
	Emit(name string, data ...any) bool
}
