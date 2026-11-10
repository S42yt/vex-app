package datadirs

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows/registry"
)

func testKeys(t *testing.T) (path string, install func(name string), uninstall func(name string)) {
	path = fmt.Sprintf(`Software\VexWavePortTest-%d\Uninstall`, os.Getpid())
	t.Cleanup(func() {
		for _, key := range channels {
			registry.DeleteKey(registry.CURRENT_USER, path+`\`+key)
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
	k, _, _ := registry.CreateKey(registry.CURRENT_USER, path+`\VexWave Canary`, registry.SET_VALUE)
	k.Close()
	for key, want := range map[string]bool{"VexWave": true, "VexWave Canary": false, "absent": false} {
		got, err := Installed(registry.CURRENT_USER, path, key)
		if err != nil || got != want {
			t.Errorf("%s: got %v, %v; want %v", key, got, err, want)
		}
	}
	if got, err := Installed(registry.CURRENT_USER, UninstallPath, "VexWave-port-test-absent"); got || err != nil {
		t.Fatalf("real path: %v %v", got, err)
	}
}

func TestUninstallRule(t *testing.T) {
	path, install, uninstall := testKeys(t)
	l := populate(t)
	check := func(key string) (bool, error) { return Installed(registry.CURRENT_USER, path, key) }
	install("VexWave")
	install("VexWave Canary")

	uninstall("VexWave Canary")
	if err := l.RemoveData("canary", others("canary"), check); err != nil {
		t.Fatal(err)
	}
	if exists(l.Channel("canary")) || !exists(l.Bin()) || !exists(l.Webview("stable")) {
		t.Fatal("canary uninstall touched more or less than its own folder")
	}

	uninstall("VexWave")
	if err := l.RemoveData("stable", others("stable"), check); err != nil || exists(l.Root) {
		t.Fatalf("last channel: err=%v root=%v", err, exists(l.Root))
	}
}
