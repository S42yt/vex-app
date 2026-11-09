package platform

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// A GUI-subsystem Go binary gets a console window per console child unless CREATE_NO_WINDOW is set.
func TestConsoleWindowForChildren(t *testing.T) {
	dir := t.TempDir()
	child, parent := filepath.Join(dir, "child.exe"), filepath.Join(dir, "parent.exe")
	for _, b := range [][]string{{"build", "-o", child, "./child"}, {"build", "-ldflags=-H windowsgui", "-o", parent, "./guiparent"}} {
		if out, err := exec.Command("go", b...).CombinedOutput(); err != nil {
			t.Fatalf("%v\n%s", err, out)
		}
	}
	out := filepath.Join(dir, "r")
	if err := exec.Command(parent, child, out).Run(); err != nil {
		t.Fatal(err)
	}
	plain, _ := os.ReadFile(out + ".plain")
	hidden, _ := os.ReadFile(out + ".nowindow")
	t.Logf("no flags: %s | CREATE_NO_WINDOW: %s", plain, hidden)
	if string(hidden) != "console=true visible=false" && string(hidden) != "console=false visible=false" {
		t.Fatal("CREATE_NO_WINDOW child still has a visible console")
	}
}

// os.Rename replaces an existing target on Windows (MoveFileEx with REPLACE_EXISTING).
func TestRenameReplaces(t *testing.T) {
	dir := t.TempDir()
	a, b := filepath.Join(dir, "a"), filepath.Join(dir, "b")
	os.WriteFile(a, []byte("new"), 0o644)
	os.WriteFile(b, []byte("old"), 0o644)
	if err := os.Rename(a, b); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(b); string(got) != "new" {
		t.Fatal(string(got))
	}
}
