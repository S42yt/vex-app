package search

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/VexWave/vex-app/internal/netx"
)

var musicSearchURL = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false"

const (
	musicClientName    = "WEB_REMIX"
	musicClientVersion = "1.20251110.01.00"
	musicSongsParams   = "EgWKAQIIAWoMEA4QChADEAQQCRAF"
	musicCoverSize     = "=w544-h544"
)

var reCoverSize = regexp.MustCompile(`=w\d+-h\d+`)

type musicText struct {
	Runs []struct {
		Text string `json:"text"`
	} `json:"runs"`
}

func (t musicText) String() string {
	var b strings.Builder
	for _, r := range t.Runs {
		b.WriteString(r.Text)
	}
	return b.String()
}

type musicItem struct {
	PlaylistItemData struct {
		VideoID string `json:"videoId"`
	} `json:"playlistItemData"`
	FlexColumns []struct {
		Column struct {
			Text musicText `json:"text"`
		} `json:"musicResponsiveListItemFlexColumnRenderer"`
	} `json:"flexColumns"`
	Thumbnail struct {
		Renderer struct {
			Thumbnail struct {
				Thumbnails []struct {
					URL   string `json:"url"`
					Width int    `json:"width"`
				} `json:"thumbnails"`
			} `json:"thumbnail"`
		} `json:"musicThumbnailRenderer"`
	} `json:"thumbnail"`
}

type musicSearchResponse struct {
	Contents struct {
		Tabbed struct {
			Tabs []struct {
				Tab struct {
					Content struct {
						SectionList struct {
							Contents []struct {
								Shelf struct {
									Contents []struct {
										Item musicItem `json:"musicResponsiveListItemRenderer"`
									} `json:"contents"`
								} `json:"musicShelfRenderer"`
							} `json:"contents"`
						} `json:"sectionListRenderer"`
					} `json:"content"`
				} `json:"tabRenderer"`
			} `json:"tabs"`
		} `json:"tabbedSearchResultsRenderer"`
	} `json:"contents"`
}

func (s *SearchService) searchYouTubeMusic(ctx context.Context, term string) ([]Result, error) {
	body, _ := json.Marshal(map[string]any{
		"context": map[string]any{"client": map[string]string{"clientName": musicClientName, "clientVersion": musicClientVersion}},
		"query":   term,
		"params":  musicSongsParams,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, musicSearchURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := netx.For(s.Proxy()).API.Do(req)
	if err != nil {
		var auth *netx.ProxyAuthError
		if errors.As(err, &auth) {
			return nil, errors.New("The proxy rejected its credentials.")
		}
		return nil, errors.New("Cannot reach YouTube Music — check your connection or proxy.")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("YouTube Music answered the search with HTTP %d.", res.StatusCode)
	}
	var page musicSearchResponse
	if err := json.NewDecoder(res.Body).Decode(&page); err != nil {
		return nil, errors.New("YouTube Music sent a search answer VexWave can't read.")
	}
	out := []Result{}
	for _, tab := range page.Contents.Tabbed.Tabs {
		for _, section := range tab.Tab.Content.SectionList.Contents {
			for _, c := range section.Shelf.Contents {
				if r, ok := musicResult(c.Item); ok {
					out = append(out, r)
				}
			}
		}
	}
	return out, nil
}

func musicResult(item musicItem) (Result, bool) {
	id := item.PlaylistItemData.VideoID
	if id == "" || len(item.FlexColumns) == 0 {
		return Result{}, false
	}
	r := Result{
		ID:    "youtube:" + id,
		Title: strings.TrimSpace(item.FlexColumns[0].Column.Text.String()),
		URL:   "https://www.youtube.com/watch?v=" + id,
	}
	if r.Title == "" {
		return Result{}, false
	}
	if len(item.FlexColumns) > 1 {
		parts := strings.Split(item.FlexColumns[1].Column.Text.String(), " • ")
		r.Artist = strings.TrimSpace(parts[0])
		r.DurationSec = clockSeconds(parts[len(parts)-1])
	}
	widest := 0
	for _, t := range item.Thumbnail.Renderer.Thumbnail.Thumbnails {
		if t.Width >= widest {
			r.ThumbnailURL, widest = t.URL, t.Width
		}
	}
	if strings.Contains(r.ThumbnailURL, "googleusercontent.com/") {
		r.ThumbnailURL = reCoverSize.ReplaceAllString(r.ThumbnailURL, musicCoverSize)
	}
	return r, true
}

func clockSeconds(s string) int {
	if !strings.Contains(s, ":") {
		return 0
	}
	total := 0
	for _, f := range strings.Split(strings.TrimSpace(s), ":") {
		n, err := strconv.Atoi(f)
		if err != nil || n < 0 {
			return 0
		}
		total = total*60 + n
	}
	return total
}
