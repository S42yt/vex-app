package backend

import (
	"context"
	"encoding/json"
)

// Needs `omitzero` on the field, so an unset value stays out of the JSON.
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

func (c *Client) Login(ctx context.Context, b Login) (string, error) {
	out, err := send(ctx, c, routeLogin, "Login", b)
	return out.Token, err
}

// Leaves the library undecoded: only whether the server answers through the proxy counts.
func (c *Client) Probe(ctx context.Context) error {
	return routeGetData.do(ctx, c, nil, nil, "Checking the proxy")
}

func (c *Client) Data(ctx context.Context) (*Data, error) {
	d, err := call(ctx, c, routeGetData, "Loading the library", NoBody{})
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (c *Client) DeleteTrack(ctx context.Context, b DeleteTrack) error {
	_, err := call(ctx, c, routeDeleteTrack, "Deleting the track", b)
	return err
}

func (c *Client) EditTrack(ctx context.Context, b EditTrack) error {
	_, err := call(ctx, c, routeEditTrack, "Editing the track", b)
	return err
}

func (c *Client) PostArtist(ctx context.Context, b CreateArtist) error {
	_, err := call(ctx, c, routePostArtist, "Creating the artist", b)
	return err
}

func (c *Client) EditArtist(ctx context.Context, b EditArtist) error {
	_, err := call(ctx, c, routeEditArtist, "Editing the artist", b)
	return err
}

func (c *Client) DeleteArtist(ctx context.Context, b DeleteByID) error {
	_, err := call(ctx, c, routeDeleteArtist, "Deleting the artist", b)
	return err
}

func (c *Client) PostPlaylist(ctx context.Context, b CreatePlaylist) error {
	_, err := call(ctx, c, routePostPlaylist, "Creating the playlist", b)
	return err
}

func (c *Client) EditPlaylist(ctx context.Context, b EditPlaylist) error {
	_, err := call(ctx, c, routeEditPlaylist, "Editing the playlist", b)
	return err
}

func (c *Client) DeletePlaylist(ctx context.Context, b DeleteByID) error {
	_, err := call(ctx, c, routeDeletePlaylist, "Deleting the playlist", b)
	return err
}

func (c *Client) PostTrack(ctx context.Context, body Stream) error {
	return reachable("Upload", routePostTrack.do(ctx, c, body, nil, "Upload"))
}
