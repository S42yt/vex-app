package backend

import (
	"context"
	"encoding/json"
	"net/http"
)

// Nullable keeps the contract's edit rule: a null image removes it, an absent one leaves it.
// Tag it `omitzero` so an unset value stays out of the JSON.
type Nullable[T any] struct {
	Set, Null bool
	V         T
}

func (n *Nullable[T]) UnmarshalJSON(b []byte) error {
	n.Set = true
	if string(b) == "null" {
		n.Null = true
		return nil
	}
	return json.Unmarshal(b, &n.V)
}

func (n Nullable[T]) MarshalJSON() ([]byte, error) {
	if n.Null || !n.Set {
		return []byte("null"), nil
	}
	return json.Marshal(n.V)
}

func (n Nullable[T]) IsZero() bool { return !n.Set }

type Track struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Duration  int32   `json:"duration"`
	ArtistIDs []int32 `json:"artistIds"`
	CoverURL  string  `json:"coverUrl"`
}

type Artist struct {
	ID       int32  `json:"id"`
	Name     string `json:"name"`
	ImageURL string `json:"imageUrl"`
}

type Playlist struct {
	ID       int32    `json:"id"`
	Name     string   `json:"name"`
	TrackIDs []string `json:"trackIds"`
	ImageURL string   `json:"imageUrl"`
}

type Data struct {
	Tracks    []Track    `json:"tracks"`
	Artists   []Artist   `json:"artists"`
	Playlists []Playlist `json:"playlists"`
}

func (c *Client) Login(ctx context.Context, username, password string) (string, error) {
	var out struct {
		Token string `json:"token"`
	}
	body := map[string]string{"username": username, "password": password}
	err := c.Do(ctx, http.MethodPost, "/login", body, &out, "Login failed", NoPayload)
	return out.Token, err
}

func (c *Client) Data(ctx context.Context) (*Data, error) {
	var d Data
	if err := c.call(ctx, "Loading the library", http.MethodGet, "/data", nil, &d, NoPayload); err != nil {
		return nil, err
	}
	return &d, nil
}

type EditTrack struct {
	ID    string `json:"id"`
	Title string `json:"title,omitempty"`
	// nil leaves the links; an empty slice clears them.
	ArtistIDs *[]int32         `json:"artistIds,omitempty"`
	Cover     Nullable[string] `json:"cover,omitzero"`
}

type PostArtist struct {
	Name  string `json:"name"`
	Image string `json:"image,omitempty"`
}

type EditArtist struct {
	ID    int32            `json:"id"`
	Name  string           `json:"name,omitempty"`
	Image Nullable[string] `json:"image,omitzero"`
}

type PostPlaylist struct {
	Name     string   `json:"name"`
	TrackIDs []string `json:"trackIds,omitempty"`
	Image    string   `json:"image,omitempty"`
}

type EditPlaylist struct {
	ID   int32  `json:"id"`
	Name string `json:"name,omitempty"`
	// nil leaves the list; an empty slice clears it.
	TrackIDs *[]string        `json:"trackIds,omitempty"`
	Image    Nullable[string] `json:"image,omitzero"`
}

func (c *Client) DeleteTrack(ctx context.Context, id string) error {
	return c.call(ctx, "Deleting the track", http.MethodPost, "/deleteTrack", map[string]string{"id": id}, nil, NoPayload)
}

func (c *Client) EditTrack(ctx context.Context, b EditTrack) error {
	return c.call(ctx, "Editing the track", http.MethodPost, "/editTrack", b, nil, Image)
}

func (c *Client) PostArtist(ctx context.Context, b PostArtist) error {
	return c.call(ctx, "Creating the artist", http.MethodPost, "/postArtist", b, nil, Image)
}

func (c *Client) EditArtist(ctx context.Context, b EditArtist) error {
	return c.call(ctx, "Editing the artist", http.MethodPost, "/editArtist", b, nil, Image)
}

func (c *Client) DeleteArtist(ctx context.Context, id int32) error {
	return c.call(ctx, "Deleting the artist", http.MethodPost, "/deleteArtist", map[string]int32{"id": id}, nil, NoPayload)
}

func (c *Client) PostPlaylist(ctx context.Context, b PostPlaylist) error {
	return c.call(ctx, "Creating the playlist", http.MethodPost, "/postPlaylist", b, nil, Image)
}

func (c *Client) EditPlaylist(ctx context.Context, b EditPlaylist) error {
	return c.call(ctx, "Editing the playlist", http.MethodPost, "/editPlaylist", b, nil, Image)
}

func (c *Client) DeletePlaylist(ctx context.Context, id int32) error {
	return c.call(ctx, "Deleting the playlist", http.MethodPost, "/deletePlaylist", map[string]int32{"id": id}, nil, NoPayload)
}
