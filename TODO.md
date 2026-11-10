# TODO

Gaps between the Go port and the Electrobun app (`77faba4`) that the port audit doesn't record.

## Drop oversized embedded covers on upload

The Electrobun app uploaded a track without its embedded cover when the cover was over `MAX_IMAGE_BYTES` (~7.5 MB). `probe()` in `internal/upload/probe.go` keeps a cover of any size, so `Confirm` sends it and the server refuses the whole upload with 413, which reads as "this track is too large".

- [ ] In `probe()`, drop `res.Cover` when it's over `backend.MaxImageBase64 / 4 * 3`.
- [ ] Test it in `internal/upload/probe_test.go`.

## Honour environment proxies when no proxy is set

With no proxy set in the app, Bun's fetch still used `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`. `netx.transport` in `internal/netx/netx.go` sets `t.Proxy = nil` then, so backend calls, audio, update checks and binary downloads go direct. yt-dlp still inherits the variables, so imports and searches do use them.

- [ ] With no proxy set, select the proxy from the environment (`httpproxy.FromEnvironment()`, falling back to `ALL_PROXY` the way Bun does), while still bypassing loopback.
- [ ] Test it in `internal/netx/netx_test.go`.

## Accept the same audio types in the Add songs dialog

The Electrobun file input accepted any `audio/*` file. The filter in `UploadService.Pick` (`internal/upload/upload.go`) lists only mp3, m4a, flac, ogg, opus, wav, aac and mp4. `.webm`, `.weba` and `.m4b` were accepted before and WebView2 plays them.

- [ ] Add `*.webm;*.weba;*.m4b` to the filter. `.aif`/`.aiff`/`.wma` were accepted too, but WebView2 can't play them.
