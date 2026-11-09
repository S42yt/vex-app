package winproc

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// ytDlp.ts rewrites whichever casing of PATH exists, because a second "PATH" beside "Path"
// loses. Go's exec dedups Env case-insensitively on Windows and keeps the last entry.
func TestAppendedPathWins(t *testing.T) {
	env := append(os.Environ(), `Path=C:\Windows\System32`) // what a GUI launch inherits
	env = append(env, `PATH=C:\VexWave\bin;C:\Windows\System32`)
	cmd := exec.Command("cmd", "/c", "echo %PATH%")
	cmd.Env = env
	out, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("child sees PATH=%s", strings.TrimSpace(string(out)))
	if !strings.HasPrefix(strings.TrimSpace(string(out)), `C:\VexWave\bin;`) {
		t.Fatal("appended PATH lost")
	}
}
