package search

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/VexWave/vex-app/internal/busy"
	"github.com/VexWave/vex-app/internal/datadirs"
	"github.com/VexWave/vex-app/internal/ytdlp"
)

const (
	resultLimit    = "24"
	resultMark     = "VEX>S "
	resultTemplate = "%(.{id,title,duration,channel,channel_is_verified,uploader,webpage_url,url,thumbnails})j"
)

func (s *SearchService) searchSoundCloud(ctx context.Context, term string) ([]Result, error) {
	release, err := s.Busy.Acquire(busy.Search)
	if err != nil {
		return nil, err
	}
	defer release()
	unlock, err := datadirs.LockBin(s.Bin, false, false)
	if err != nil {
		return nil, err
	}
	defer unlock()
	cmd := ytdlp.Command(ctx, s.Bin, s.Proxy(), "--flat-playlist", "--print", resultMark+resultTemplate, "scsearch"+resultLimit+":"+term)
	var stderr ytdlp.Tail
	cmd.Stderr = &stderr
	out, runErr := cmd.Output()
	results := parseSoundCloud(string(out), term)
	if len(results) == 0 && runErr != nil {
		return nil, errors.New(ytdlp.Failure(runErr, stderr.String()))
	}
	return results, nil
}

type entry struct {
	ID         *string  `json:"id"`
	Title      string   `json:"title"`
	Duration   *float64 `json:"duration"`
	Channel    *string  `json:"channel"`
	Verified   bool     `json:"channel_is_verified"`
	Uploader   *string  `json:"uploader"`
	WebpageURL *string  `json:"webpage_url"`
	URL        *string  `json:"url"`
	Thumbnails []struct {
		URL   *string  `json:"url"`
		Width *float64 `json:"width"`
	} `json:"thumbnails"`
}

var reTopic = regexp.MustCompile(`(?i)\s-\s*Topic$`)

func parseSoundCloud(stdout, query string) []Result {
	var hits []Hit
	var results []Result
	for _, line := range strings.Split(stdout, "\n") {
		raw, ok := strings.CutPrefix(strings.TrimRight(line, "\r"), resultMark)
		if !ok {
			continue
		}
		var e entry
		if json.Unmarshal([]byte(raw), &e) != nil {
			continue
		}
		url := first(e.WebpageURL, e.URL)
		title := strings.TrimSpace(e.Title)
		if url == "" || title == "" {
			continue
		}
		r := Result{ID: "soundcloud:" + first(e.ID, &url), Title: title, URL: url, Artist: ytdlp.CleanArtistName(first(e.Channel, e.Uploader))}
		var dur *int
		if e.Duration != nil && *e.Duration > 0 && !math.IsInf(*e.Duration, 0) {
			d := int(math.Round(*e.Duration))
			r.DurationSec, dur = d, &d
		}
		var widest float64
		unsized := ""
		for _, t := range e.Thumbnails {
			switch {
			case t.URL == nil:
			case t.Width != nil:
				if r.ThumbnailURL == "" || *t.Width > widest {
					r.ThumbnailURL, widest = *t.URL, *t.Width
				}
			case unsized == "":
				unsized = *t.URL
			}
		}
		if r.ThumbnailURL == "" {
			r.ThumbnailURL = unsized
		}
		channel := ""
		if e.Channel != nil {
			channel = *e.Channel
		}
		hits = append(hits, Hit{ID: strconv.Itoa(len(results)), Signals: Signals{
			Title: title, Creator: r.Artist, DurationSec: dur,
			TopicChannel: reTopic.MatchString(channel), Verified: e.Verified,
		}})
		results = append(results, r)
	}
	out := []Result{}
	for _, h := range Rank(hits, query) {
		i, _ := strconv.Atoi(h.ID)
		out = append(out, results[i])
	}
	return out
}

func first(a, b *string) string {
	if a != nil {
		return *a
	}
	if b != nil {
		return *b
	}
	return ""
}
