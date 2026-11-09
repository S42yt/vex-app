package library

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/VexWave/vex-app/internal/session"
)

type urls struct{}

func (urls) TrackURL(id string) string                  { return "L/track/" + id }
func (urls) TrackImageURL(id, v string) string          { return "L/track/" + id + "/image?v=" + v }
func (urls) ArtistImageURL(id int32, v string) string   { return "L/artist/image?v=" + v }
func (urls) PlaylistImageURL(id int32, v string) string { return "L/playlist/image?v=" + v }
func (urls) Evict(string)                               {}

func TestLibraryHasNoNullArrays(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"tracks":[{"id":"t","title":"T","duration":1000,"artistIds":null,"coverUrl":"/track/t/image?v=h"}],"artists":[],"playlists":[{"id":1,"name":"P","trackIds":null}]}`))
	}))
	defer srv.Close()
	store := &session.Store{}
	store.Restore(session.Session{BaseURL: srv.URL, Token: "t"})
	lib, err := (&LibraryService{Store: store, URLs: urls{}}).GetLibrary(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(lib)
	if strings.Contains(string(b), "null") {
		t.Fatal(string(b))
	}
	if lib.Tracks[0].CoverURL != "L/track/t/image?v=h" || lib.Tracks[0].StreamURL != "L/track/t" {
		t.Fatal(lib.Tracks[0])
	}
	empty, _ := json.Marshal(&Library{})
	if !strings.Contains(string(empty), "null") {
		t.Fatal("the check above can't see a nil slice")
	}
}

func TestUnauthorizedExpires(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	store := &session.Store{}
	store.Restore(session.Session{BaseURL: srv.URL, Token: "t"})
	if err := (&LibraryService{Store: store, URLs: urls{}}).DeletePlaylist(context.Background(), DeleteByIDParams{1}); err == nil {
		t.Fatal("no error")
	}
	if _, ok := store.Current(); ok {
		t.Fatal("still logged in")
	}
}
