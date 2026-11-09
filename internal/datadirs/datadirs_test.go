package datadirs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows/registry"
)

var channels = []Channel{{"stable", "VexWave"}, {"canary", "VexWave Canary"}}

func others(self string) []Channel {
	var out []Channel
	for _, c := range channels {
		if c.Name != self {
			out = append(out, c)
		}
	}
	return out
}

func populate(t *testing.T) Layout {
	l := Layout{filepath.Join(t.TempDir(), "VexWaveData")}
	for _, p := range []string{l.Bin(), l.Webview("stable"), l.Imports("stable"), l.Webview("canary"), l.Imports("canary")} {
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
		os.WriteFile(filepath.Join(p, "f"), []byte("x"), 0o644)
	}
	return l
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

// Fake Uninstall keys under a throwaway HKCU path, removed afterwards.
func testKeys(t *testing.T) (path string, install func(name string), uninstall func(name string)) {
	path = fmt.Sprintf(`Software\VexWavePortTest-%d\Uninstall`, os.Getpid())
	t.Cleanup(func() {
		for _, c := range channels {
			registry.DeleteKey(registry.CURRENT_USER, path+`\`+c.UninstallKey)
		}
		registry.DeleteKey(registry.CURRENT_USER, path)
		registry.DeleteKey(registry.CURRENT_USER, filepath.Dir(path))
	})
	install = func(name string) {
		k, _, err := registry.CreateKey(registry.CURRENT_USER, path+`\`+name, registry.SET_VALUE)
		if err != nil {
			t.Fatal(err)
		}
		k.SetStringValue("UninstallString", `"C:\x\uninstall.exe"`)
		k.Close()
	}
	uninstall = func(name string) {
		if err := registry.DeleteKey(registry.CURRENT_USER, path+`\`+name); err != nil {
			t.Fatal(err)
		}
	}
	return
}

func TestLayout(t *testing.T) {
	l := Default()
	if want := filepath.Join(os.Getenv("LOCALAPPDATA"), "VexWaveData", "canary", "webview"); l.Webview("canary") != want {
		t.Fatal(l.Webview("canary"))
	}
	if filepath.Base(l.Bin()) != "bin" || filepath.Dir(l.Bin()) != l.Root {
		t.Fatal(l.Bin())
	}
}

func TestInstalledReadsHKCU(t *testing.T) {
	path, install, _ := testKeys(t)
	install("VexWave")
	k, _, _ := registry.CreateKey(registry.CURRENT_USER, path+`\VexWave Canary`, registry.SET_VALUE) // key without UninstallString
	k.Close()
	for key, want := range map[string]bool{"VexWave": true, "VexWave Canary": false, "absent": false} {
		got, err := Installed(registry.CURRENT_USER, path, key)
		if err != nil || got != want {
			t.Errorf("%s: got %v, %v; want %v", key, got, err, want)
		}
	}
	// The real Uninstall path is readable without elevation.
	if got, err := Installed(registry.CURRENT_USER, UninstallPath, "VexWave-port-test-absent"); got || err != nil {
		t.Fatalf("real path: %v %v", got, err)
	}
}

// Uninstall canary while stable is installed, then stable as the last channel.
func TestUninstallRule(t *testing.T) {
	path, install, uninstall := testKeys(t)
	l := populate(t)
	check := func(c Channel) (bool, error) { return Installed(registry.CURRENT_USER, path, c.UninstallKey) }
	install("VexWave")
	install("VexWave Canary")

	uninstall("VexWave Canary") // NSIS removes its own key; order relative to RemoveData doesn't matter
	shared, err := l.RemoveData("canary", others("canary"), check)
	if err != nil || shared {
		t.Fatalf("canary: shared=%v err=%v", shared, err)
	}
	if exists(l.Channel("canary")) || !exists(l.Bin()) || !exists(l.Webview("stable")) {
		t.Fatal("canary uninstall touched more or less than its own folder")
	}

	uninstall("VexWave")
	shared, err = l.RemoveData("stable", others("stable"), check)
	if err != nil || !shared || exists(l.Root) {
		t.Fatalf("last channel: shared=%v err=%v root=%v", shared, err, exists(l.Root))
	}
}

func TestUninstallKeepsSharedWhenUnsure(t *testing.T) {
	l := populate(t)
	shared, err := l.RemoveData("canary", others("canary"), func(Channel) (bool, error) { return false, errors.New("access denied") })
	if err != nil || shared || !exists(l.Bin()) {
		t.Fatal("registry error removed shared data")
	}
}

func TestUninstallToleratesMissingFolders(t *testing.T) {
	l := Layout{filepath.Join(t.TempDir(), "never-created")}
	if _, err := l.RemoveData("stable", others("stable"), func(Channel) (bool, error) { return false, nil }); err != nil {
		t.Fatal(err)
	}
}
