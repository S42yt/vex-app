package upload

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/VexWave/vex-app/internal/platform"
)

type probed struct {
	Title      string
	DurationMs int
	Cover      []byte
}

type ffprobeOut struct {
	Format struct {
		Duration string            `json:"duration"`
		Tags     map[string]string `json:"tags"`
	} `json:"format"`
	Streams []struct {
		Index       int               `json:"index"`
		CodecType   string            `json:"codec_type"`
		Tags        map[string]string `json:"tags"`
		Disposition struct {
			AttachedPic int `json:"attached_pic"`
		} `json:"disposition"`
	} `json:"streams"`
}

var errNoAudio = errors.New("no audio stream")

func tag(tags map[string]string, key string) string {
	for k, v := range tags {
		if strings.EqualFold(k, key) {
			return v
		}
	}
	return ""
}

func probe(ctx context.Context, bin, path string) (probed, error) {
	out, err := platform.Command(ctx, bin, filepath.Join(bin, platform.Exe("ffprobe")),
		"-v", "error", "-print_format", "json", "-show_format", "-show_streams", path).Output()
	if err != nil {
		return probed{}, err
	}
	var p ffprobeOut
	if err := json.Unmarshal(out, &p); err != nil {
		return probed{}, err
	}
	res := probed{Title: tag(p.Format.Tags, "title")}
	audio := false
	for _, s := range p.Streams {
		if s.CodecType == "audio" {
			audio = true
			if res.Title == "" {
				res.Title = tag(s.Tags, "title") // Ogg/Opus keep tags on the stream
			}
		}
	}
	if !audio {
		return probed{}, errNoAudio
	}
	if res.Title == "" {
		res.Title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	if d, err := strconv.ParseFloat(p.Format.Duration, 64); err == nil {
		res.DurationMs = int(math.Round(d * 1000))
	}
	for _, s := range p.Streams {
		if s.Disposition.AttachedPic == 1 {
			var buf bytes.Buffer
			cmd := platform.Command(ctx, bin, filepath.Join(bin, platform.Exe("ffmpeg")),
				"-v", "error", "-i", path, "-map", "0:"+strconv.Itoa(s.Index), "-c", "copy", "-f", "image2pipe", "-")
			cmd.Stdout = &buf
			if cmd.Run() == nil {
				res.Cover = buf.Bytes()
			}
			break
		}
	}
	return res, nil
}
