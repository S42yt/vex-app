package uninstall

import (
	"crypto/rand"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"golang.org/x/sys/windows/registry"
)

func TestMain(m *testing.M) {
	if os.Getenv("SLEEP_THEN_EXIT") != "" {
		time.Sleep(700 * time.Millisecond)
		os.Exit(0)
	}
	if marker := os.Getenv("WRITE_MARKER"); marker != "" {
		os.WriteFile(marker, []byte(os.Args[len(os.Args)-1]), 0o644)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestInstallDir(t *testing.T) {
	path := `Software\VexWave-port-test-` + rand.Text()
	k, _, err := registry.CreateKey(registry.CURRENT_USER, path+`\VexWave`, registry.SET_VALUE)
	if err != nil {
		t.Fatal(err)
	}
	k.SetStringValue("UninstallString", `"C:\Users\u\AppData\Local\Programs\VexWave\uninstall.exe"`)
	k.Close()
	t.Cleanup(func() {
		registry.DeleteKey(registry.CURRENT_USER, path+`\VexWave`)
		registry.DeleteKey(registry.CURRENT_USER, path)
	})
	for exe, want := range map[string]bool{
		`C:\Users\u\AppData\Local\Programs\VexWave\VexWave.exe`:        true,
		`C:\Users\u\AppData\Local\Programs\VexWave Canary\VexWave.exe`: false,
		`C:\Users\u\AppData\Local\Programs\VexWave.exe`:                false,
		`D:\VexWave\VexWave.exe`:                                       false,
	} {
		if _, got := installDir(registry.CURRENT_USER, path, "VexWave", exe); got != want {
			t.Errorf("%s: %v", exe, got)
		}
	}
	if _, ok := installDir(registry.CURRENT_USER, path, "VexWave Canary", `C:\x.exe`); ok {
		t.Error("absent key counts as installed")
	}
}

func TestHelperWaitsThenUninstalls(t *testing.T) {
	dir := t.TempDir()
	self, _ := os.Open(os.Args[0])
	fake, _ := os.Create(filepath.Join(dir, "uninstall.exe"))
	io.Copy(fake, self)
	self.Close()
	fake.Close()
	marker := filepath.Join(dir, "ran")
	t.Setenv("WRITE_MARKER", marker)

	app := exec.Command(os.Args[0], "-test.run=^$")
	app.Env = append(os.Environ(), "SLEEP_THEN_EXIT=1")
	if err := app.Start(); err != nil {
		t.Fatal(err)
	}
	defer app.Wait()
	start := time.Now()

	if err := Helper(strconv.Itoa(app.Process.Pid), dir); err != nil {
		t.Fatal(err)
	}
	took := time.Since(start)
	if got, err := os.ReadFile(marker); err != nil || string(got) != "/S" {
		t.Fatalf("uninstall.exe: %q %v", got, err)
	}
	if took < 500*time.Millisecond {
		t.Fatalf("ran the uninstaller after %v, before the app exited", took)
	}
}

func TestSpawnDetached(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ran")
	cmd := exec.Command(os.Args[0], "-test.run=^$", "detached")
	cmd.Env = append(os.Environ(), "WRITE_MARKER="+marker)
	if err := spawnDetached(cmd); err != nil {
		t.Fatal(err)
	}
	for range 100 {
		if got, _ := os.ReadFile(marker); string(got) == "detached" {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("the detached child never ran")
}
