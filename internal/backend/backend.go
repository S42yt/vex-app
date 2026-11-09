package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/VexWave/vex-app/internal/netx"
)

type Failure struct {
	Status        int    `json:"status,omitempty"`
	RetryAfterSec int    `json:"retryAfterSec,omitempty"`
	Message       string `json:"error"`
}

func (f *Failure) Error() string { return f.Message }

var ErrNotLoggedIn = &Failure{Status: http.StatusUnauthorized, Message: "Not logged in"}

type Payload int

const (
	NoPayload Payload = iota
	Audio
	Image
)

type Client struct {
	BaseURL, Token string
	HTTP           *http.Client
}

type Stream struct {
	Reader io.Reader
	Len    int64
}

func (c *Client) Do(ctx context.Context, method, path string, body, out any, fallback string, payload Payload) error {
	var rd io.Reader
	var length int64
	switch b := body.(type) {
	case nil:
	case Stream:
		rd, length = b.Reader, b.Len
	default:
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd, length = bytes.NewReader(data), int64(len(data))
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, rd)
	if err != nil {
		return err
	}
	req.ContentLength = length
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("Authorization", c.Token)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		var pa *netx.ProxyAuthError
		if errors.As(err, &pa) {
			return proxyRejected
		}
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 == 2 {
		if out == nil {
			return nil
		}
		return json.NewDecoder(res.Body).Decode(out)
	}
	return failure(res, fmt.Sprintf("%s (HTTP %d)", fallback, res.StatusCode), payload)
}

func (c *Client) call(ctx context.Context, what, method, path string, body, out any, payload Payload) error {
	err := c.Do(ctx, method, path, body, out, what+" failed", payload)
	var f *Failure
	if err != nil && !errors.As(err, &f) {
		return &Failure{Message: what + " failed — server unreachable"}
	}
	return err
}

var proxyRejected = &Failure{Status: http.StatusProxyAuthRequired, Message: "The proxy rejected its credentials."}

func failure(res *http.Response, fallback string, payload Payload) *Failure {
	f := &Failure{Status: res.StatusCode}
	switch {
	case res.StatusCode == http.StatusProxyAuthRequired:
		return proxyRejected
	case res.StatusCode == http.StatusTooManyRequests:
		f.RetryAfterSec = retryAfter(res.Header.Get("Retry-After"), time.Now())
		f.Message = "Too many requests — please wait a moment and try again."
		if f.RetryAfterSec > 0 {
			f.Message = "Too many requests — try again in " + formatDelay(f.RetryAfterSec) + "."
		}
		return f
	case res.StatusCode == http.StatusRequestEntityTooLarge && payload != NoPayload:
		what, limit := "image", MaxImageBase64
		if payload == Audio {
			what, limit = "track", MaxAudioBase64
		}
		fallback = fmt.Sprintf("The server refused this %s as too large — this app allows up to %.1f MB.", what, float64(limit/4*3)/(1<<20))
	}
	f.Message = errorText(res, fallback)
	return f
}

func errorText(res *http.Response, fallback string) string {
	if !strings.HasPrefix(res.Header.Get("Content-Type"), "text/plain") {
		return fallback
	}
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if len(b) == 0 {
		return fallback
	}
	return string(b)
}

func retryAfter(v string, now time.Time) int {
	if v == "" {
		return 0
	}
	if s, err := strconv.ParseFloat(v, 64); err == nil {
		if s > 0 && !math.IsInf(s, 0) {
			return int(math.Ceil(s))
		}
		return 0
	}
	if at, err := http.ParseTime(v); err == nil && at.After(now) {
		return int(math.Ceil(at.Sub(now).Seconds()))
	}
	return 0
}

func formatDelay(sec int) string {
	if sec < 60 {
		return plural(sec, "second")
	}
	return plural((sec+59)/60, "minute")
}

func plural(n int, unit string) string {
	if n == 1 {
		return "1 " + unit
	}
	return strconv.Itoa(n) + " " + unit + "s"
}

func TrackAudioPath(id string) string { return "/track/" + url.PathEscape(id) + "/audio" }

func TrackImagePath(id, version string) string {
	return "/track/" + url.PathEscape(id) + "/image" + versionQuery(version)
}

func ArtistImagePath(id int32, version string) string {
	return "/artist/" + strconv.Itoa(int(id)) + "/image" + versionQuery(version)
}

func PlaylistImagePath(id int32, version string) string {
	return "/playlist/" + strconv.Itoa(int(id)) + "/image" + versionQuery(version)
}

func versionQuery(v string) string {
	if v == "" {
		return ""
	}
	return "?v=" + url.QueryEscape(v)
}

func ImageVersion(u string) string {
	_, q, ok := strings.Cut(u, "?")
	if !ok {
		return ""
	}
	vals, _ := url.ParseQuery(q)
	return vals.Get("v")
}
