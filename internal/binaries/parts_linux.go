package binaries

import "runtime"

func parts(n Name) []part {
	arm := runtime.GOARCH == "arm64"
	switch n {
	case YtDlp:
		exe := "yt-dlp_linux"
		if arm {
			exe = "yt-dlp_linux_aarch64"
		}
		return []part{{"https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + exe, raw, []file{{"", "yt-dlp"}}}}
	case FFmpeg:
		variant := "linux64"
		if arm {
			variant = "linuxarm64"
		}
		folder := "ffmpeg-master-latest-" + variant + "-gpl"
		return []part{{"https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/" + folder + ".tar.xz", tarXz,
			[]file{{folder + "/bin/ffmpeg", "ffmpeg"}, {folder + "/bin/ffprobe", "ffprobe"}}}}
	default:
		target := "x86_64-unknown-linux-gnu"
		if arm {
			target = "aarch64-unknown-linux-gnu"
		}
		return []part{{"https://github.com/denoland/deno/releases/latest/download/deno-" + target + ".zip", zipped, []file{{"deno", "deno"}}}}
	}
}
