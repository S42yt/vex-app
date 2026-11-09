package platform

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
	"unsafe"

	"github.com/VexWave/vex-app/internal/datadirs"
	"golang.org/x/sys/windows"
)

func children(pid uint32) []uint32 {
	snap, _ := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	var out []uint32
	for err := windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		if e.ParentProcessID == pid {
			out = append(out, e.ProcessID)
			out = append(out, children(e.ProcessID)...)
		}
	}
	return out
}

func alive(pid uint32) bool {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var code uint32
	windows.GetExitCodeProcess(h, &code)
	return code == 259 // STILL_ACTIVE
}

func ytdlp(t *testing.T) string {
	p := filepath.Join(datadirs.Default().Bin(), "yt-dlp.exe")
	if _, err := os.Stat(p); err != nil {
		t.Skip("no yt-dlp.exe")
	}
	return p
}

func TestYtDlpKillLeavesChildren(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, ytdlp(t), "--encoding", "UTF-8", "--flat-playlist", "--print", "%(id)s", "ytsearch24:ambient music")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(2500 * time.Millisecond)
	kids := children(uint32(cmd.Process.Pid))
	t.Logf("yt-dlp.exe pid %d has descendants %v", cmd.Process.Pid, kids)
	cancel()
	cmd.Wait()
	time.Sleep(1500 * time.Millisecond)
	var survivors []uint32
	for _, k := range kids {
		if alive(k) {
			survivors = append(survivors, k)
		}
	}
	t.Logf("after killing the parent, still running: %v", survivors)
	for _, k := range survivors {
		if h, err := windows.OpenProcess(windows.PROCESS_TERMINATE, false, k); err == nil {
			windows.TerminateProcess(h, 1)
			windows.CloseHandle(h)
		}
	}
}

func TestJobObjectKillsTree(t *testing.T) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(ytdlp(t), "--encoding", "UTF-8", "--flat-playlist", "--print", "%(id)s", "ytsearch24:ambient music")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	h, _ := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
	if err := windows.AssignProcessToJobObject(job, h); err != nil {
		t.Fatal(err)
	}
	windows.CloseHandle(h)
	time.Sleep(2500 * time.Millisecond)
	kids := children(uint32(cmd.Process.Pid))
	windows.CloseHandle(job)
	cmd.Wait()
	time.Sleep(500 * time.Millisecond)
	for _, k := range kids {
		if alive(k) {
			t.Fatalf("descendant %d survived the job", k)
		}
	}
	t.Logf("job closed: parent and %d descendants gone", len(kids))
}
