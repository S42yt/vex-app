// Package upload streams a local audio file to POST /tracks as the contract's
// JSON body ({title, duration, artistIds?, cover?, data}) without holding it in memory.
package upload

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

const MaxAudioBytes = ((100 * 1024 * 1024) / 4) * 3

type Meta struct {
	Title      string  `json:"title"`
	DurationMs int     `json:"duration"`
	ArtistIDs  []int32 `json:"artistIds,omitempty"`
	Cover      []byte  `json:"cover,omitempty"` // encoding/json writes []byte as base64
}

var ErrTooLarge = fmt.Errorf("track is over the %d byte limit", MaxAudioBytes)

// Body returns a reader producing {...meta, "data":"<base64 of file>"} and its exact length.
func Body(meta Meta, f *os.File) (io.Reader, int64, error) {
	st, err := f.Stat()
	if err != nil {
		return nil, 0, err
	}
	if st.Size() > MaxAudioBytes {
		return nil, 0, ErrTooLarge
	}
	head, err := json.Marshal(meta)
	if err != nil {
		return nil, 0, err
	}
	prefix := append(head[:len(head)-1:len(head)-1], `,"data":"`...)
	suffix := []byte(`"}`)

	pr, pw := io.Pipe()
	go func() {
		enc := base64.NewEncoder(base64.StdEncoding, pw)
		_, err := io.Copy(enc, f)
		if err == nil {
			err = enc.Close()
		}
		pw.CloseWithError(err)
	}()
	n := int64(len(prefix)) + int64(base64.StdEncoding.EncodedLen(int(st.Size()))) + int64(len(suffix))
	return io.MultiReader(bytes.NewReader(prefix), pr, bytes.NewReader(suffix)), n, nil
}

func Send(ctx context.Context, c *http.Client, url, token string, meta Meta, path string) (*http.Response, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	body, n, err := Body(meta, f)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
	if err != nil {
		return nil, err
	}
	req.ContentLength = n
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	return c.Do(req)
}
