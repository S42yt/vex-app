package backend

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func answer(status int, h map[string]string, body string) *Client {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for k, v := range h {
			w.Header().Set(k, v)
		}
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	return &Client{BaseURL: srv.URL, Token: "t", HTTP: srv.Client()}
}

func TestFailures(t *testing.T) {
	cases := []struct {
		name    string
		status  int
		h       map[string]string
		body    string
		payload Payload
		want    Failure
	}{
		{"plain text reason", 404, map[string]string{"Content-Type": "text/plain; charset=utf-8"}, "No such track", NoPayload, Failure{Status: 404, Message: "No such track"}},
		{"html from a proxy", 502, map[string]string{"Content-Type": "text/html"}, "<h1>Bad gateway</h1>", NoPayload, Failure{Status: 502, Message: "Editing the track failed (HTTP 502)"}},
		{"429 seconds", 429, map[string]string{"Retry-After": "90"}, "", NoPayload, Failure{Status: 429, RetryAfterSec: 90, Message: "Too many requests — try again in 2 minutes."}},
		{"429 one second", 429, map[string]string{"Retry-After": "1"}, "", NoPayload, Failure{Status: 429, RetryAfterSec: 1, Message: "Too many requests — try again in 1 second."}},
		{"429 no header", 429, nil, "", NoPayload, Failure{Status: 429, Message: "Too many requests — please wait a moment and try again."}},
		{"413 image", 413, nil, "", Image, Failure{Status: 413, Message: "The server refused this image as too large — this app allows up to 7.5 MB."}},
		{"413 plain text wins", 413, map[string]string{"Content-Type": "text/plain"}, "Body over 2 MB", Image, Failure{Status: 413, Message: "Body over 2 MB"}},
		{"407", 407, nil, "", NoPayload, Failure{Status: 407, Message: "The proxy rejected its credentials."}},
	}
	for _, c := range cases {
		err := answer(c.status, c.h, c.body).call(context.Background(), "Editing the track", "POST", "/editTrack", map[string]string{}, nil, c.payload)
		var f *Failure
		if !errors.As(err, &f) || *f != c.want {
			t.Errorf("%s: got %#v", c.name, err)
		}
	}
}

func TestUnreachable(t *testing.T) {
	c := &Client{BaseURL: "http://127.0.0.1:1", HTTP: http.DefaultClient}
	err := c.DeleteTrack(context.Background(), "x")
	var f *Failure
	if !errors.As(err, &f) || f.Message != "Deleting the track failed — server unreachable" {
		t.Fatalf("%#v", err)
	}
}

func TestRetryAfterDate(t *testing.T) {
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	if got := retryAfter(now.Add(90*time.Second).Format(http.TimeFormat), now); got != 90 {
		t.Fatal(got)
	}
	if got := retryAfter(now.Add(-time.Minute).Format(http.TimeFormat), now); got != 0 {
		t.Fatal(got)
	}
}

// What arrives from the webview as {}, {cover: null} and {cover: "QUJD"} reaches the backend as absent, null and set.
func TestNullableRoundTrip(t *testing.T) {
	for in, want := range map[string]string{
		`{"id":"a"}`:                 `{"id":"a"}`,
		`{"id":"a","cover":null}`:    `{"id":"a","cover":null}`,
		`{"id":"a","cover":"QUJD"}`:  `{"id":"a","cover":"QUJD"}`,
		`{"id":"a","artistIds":[]}`:  `{"id":"a","artistIds":[]}`,
		`{"id":"a","artistIds":[1]}`: `{"id":"a","artistIds":[1]}`,
	} {
		var e EditTrack
		if err := json.Unmarshal([]byte(in), &e); err != nil {
			t.Fatal(err)
		}
		out, _ := json.Marshal(e)
		if string(out) != want {
			t.Errorf("%s → %s, want %s", in, out, want)
		}
	}
}

func TestImageVersion(t *testing.T) {
	if v := ImageVersion("/track/x/image?v=abc"); v != "abc" {
		t.Fatal(v)
	}
	if v := ImageVersion("/track/x/image"); v != "" {
		t.Fatal(v)
	}
	if p := ArtistImagePath(7, "h1"); p != "/artist/7/image?v=h1" {
		t.Fatal(p)
	}
}
