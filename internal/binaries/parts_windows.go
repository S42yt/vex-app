package binaries

import "runtime"

func parts(n Name) []part {
	arm := runtime.GOARCH == "arm64"
	switch n {
	case YtDlp:
		exe := "yt-dlp.exe"
		if arm {
			exe = "yt-dlp_arm64.exe"
		}
		return []part{{"https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + exe, raw, []file{{"", "yt-dlp.exe"}}}}
	case FFmpeg:
		variant := "win64"
		if arm {
			variant = "winarm64"
		}
		folder := "ffmpeg-master-latest-" + variant + "-gpl"
		return []part{{"https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/" + folder + ".zip", zipped,
			[]file{{folder + "/bin/ffmpeg.exe", "ffmpeg.exe"}, {folder + "/bin/ffprobe.exe", "ffprobe.exe"}}}}
	default:
		// No arm64 Windows build is published; x64 runs under emulation.
		return []part{{"https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip", zipped, []file{{"deno.exe", "deno.exe"}}}}
	}
}
