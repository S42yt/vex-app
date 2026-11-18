package library

import (
	"context"

	"github.com/VexWave/vex-app/internal/backend"
	"github.com/VexWave/vex-app/internal/session"
)

type URLs interface {
	TrackURL(id string) string
	TrackImageURL(id, version string) string
	ArtistImageURL(id int32, version string) string
	PlaylistImageURL(id int32, version string) string
	Evict(id string)
}

type LibraryService struct {
	Store *session.Store
	URLs  URLs
}

type Track struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	ArtistIDs  []int32 `json:"artistIds"`
	DurationMs int32   `json:"durationMs"`
	StreamURL  string  `json:"streamUrl"`
	CoverURL   string  `json:"coverUrl,omitempty"`
}

type Artist struct {
	ID       int32  `json:"id"`
	Name     string `json:"name"`
	ImageURL string `json:"imageUrl,omitempty"`
}

type Playlist struct {
	ID       int32    `json:"id"`
	Name     string   `json:"name"`
	TrackIDs []string `json:"trackIds"`
	ImageURL string   `json:"imageUrl,omitempty"`
}

type Library struct {
	Tracks    []Track    `json:"tracks"`
	Artists   []Artist   `json:"artists"`
	Playlists []Playlist `json:"playlists"`
}

func (l *LibraryService) GetLibrary(ctx context.Context) (*Library, error) {
	var d *backend.Data
	err := l.Store.With(func(c *backend.Client) (err error) { d, err = c.Data(ctx); return })
	if err != nil {
		return nil, err
	}
	out := &Library{
		Tracks:    make([]Track, 0, len(d.Tracks)),
		Artists:   make([]Artist, 0, len(d.Artists)),
		Playlists: make([]Playlist, 0, len(d.Playlists)),
	}
	for _, t := range d.Tracks {
		tr := Track{ID: t.ID, Title: t.Title, ArtistIDs: nonNil(t.ArtistIDs), DurationMs: t.Duration, StreamURL: l.URLs.TrackURL(t.ID)}
		if t.CoverURL != "" {
			tr.CoverURL = l.URLs.TrackImageURL(t.ID, backend.ImageVersion(t.CoverURL))
		}
		out.Tracks = append(out.Tracks, tr)
	}
	for _, a := range d.Artists {
		ar := Artist{ID: a.ID, Name: a.Name}
		if a.ImageURL != "" {
			ar.ImageURL = l.URLs.ArtistImageURL(a.ID, backend.ImageVersion(a.ImageURL))
		}
		out.Artists = append(out.Artists, ar)
	}
	for _, p := range d.Playlists {
		pl := Playlist{ID: p.ID, Name: p.Name, TrackIDs: nonNil(p.TrackIDs)}
		if p.ImageURL != "" {
			pl.ImageURL = l.URLs.PlaylistImageURL(p.ID, backend.ImageVersion(p.ImageURL))
		}
		out.Playlists = append(out.Playlists, pl)
	}
	return out, nil
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

type DeleteTrackParams struct {
	ID string `json:"id"`
}

func (l *LibraryService) DeleteTrack(ctx context.Context, p DeleteTrackParams) error {
	err := l.Store.With(func(c *backend.Client) error { return c.DeleteTrack(ctx, backend.DeleteTrack{ID: p.ID}) })
	if err == nil {
		l.URLs.Evict(p.ID)
	}
	return err
}

type EditTrackParams struct {
	ID          string                   `json:"id"`
	Title       string                   `json:"title,omitempty"`
	ArtistIDs   *[]int32                 `json:"artistIds,omitempty"`
	CoverBase64 backend.Nullable[string] `json:"coverBase64,omitzero"`
}

func (l *LibraryService) EditTrack(ctx context.Context, p EditTrackParams) error {
	return l.Store.With(func(c *backend.Client) error {
		return c.EditTrack(ctx, backend.EditTrack{ID: p.ID, Title: p.Title, ArtistIDs: deref(p.ArtistIDs), Cover: p.CoverBase64})
	})
}

type CreateArtistParams struct {
	Name        string `json:"name"`
	ImageBase64 string `json:"imageBase64,omitempty"`
}

func (l *LibraryService) CreateArtist(ctx context.Context, p CreateArtistParams) error {
	return l.Store.With(func(c *backend.Client) error {
		return c.PostArtist(ctx, backend.CreateArtist{Name: p.Name, Image: p.ImageBase64})
	})
}

type EditArtistParams struct {
	ID          int32                    `json:"id"`
	Name        string                   `json:"name,omitempty"`
	ImageBase64 backend.Nullable[string] `json:"imageBase64,omitzero"`
}

func (l *LibraryService) EditArtist(ctx context.Context, p EditArtistParams) error {
	return l.Store.With(func(c *backend.Client) error {
		return c.EditArtist(ctx, backend.EditArtist{ID: p.ID, Name: p.Name, Image: p.ImageBase64})
	})
}

type DeleteByIDParams struct {
	ID int32 `json:"id"`
}

func (l *LibraryService) DeleteArtist(ctx context.Context, p DeleteByIDParams) error {
	return l.Store.With(func(c *backend.Client) error { return c.DeleteArtist(ctx, backend.DeleteByID{ID: p.ID}) })
}

type CreatePlaylistParams struct {
	Name        string   `json:"name"`
	TrackIDs    []string `json:"trackIds,omitempty"`
	ImageBase64 string   `json:"imageBase64,omitempty"`
}

func (l *LibraryService) CreatePlaylist(ctx context.Context, p CreatePlaylistParams) error {
	return l.Store.With(func(c *backend.Client) error {
		return c.PostPlaylist(ctx, backend.CreatePlaylist{Name: p.Name, TrackIDs: p.TrackIDs, Image: p.ImageBase64})
	})
}

type EditPlaylistParams struct {
	ID          int32                    `json:"id"`
	Name        string                   `json:"name,omitempty"`
	TrackIDs    *[]string                `json:"trackIds,omitempty"`
	ImageBase64 backend.Nullable[string] `json:"imageBase64,omitzero"`
}

func (l *LibraryService) EditPlaylist(ctx context.Context, p EditPlaylistParams) error {
	return l.Store.With(func(c *backend.Client) error {
		return c.EditPlaylist(ctx, backend.EditPlaylist{ID: p.ID, Name: p.Name, TrackIDs: deref(p.TrackIDs), Image: p.ImageBase64})
	})
}

func (l *LibraryService) DeletePlaylist(ctx context.Context, p DeleteByIDParams) error {
	return l.Store.With(func(c *backend.Client) error { return c.DeletePlaylist(ctx, backend.DeleteByID{ID: p.ID}) })
}

func deref[T any](p *[]T) []T {
	if p == nil {
		return nil
	}
	return *p
}
