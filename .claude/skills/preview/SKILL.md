---
name: preview
description: Render any view of the VexWave app to a transparent PNG, with whatever state the request calls for — a full library, an empty one, a download in flight, an artist with one track. Use whenever a picture of the app is wanted, a design change needs seeing, or an existing image is out of date.
---

# Previewing a view of the app

Renders the **real `<App/>`** — the actual components, not a mockup — against
state you write, framed in a Windows window, as a transparent PNG.

The app can't be photographed directly: it needs a live backend login before any
view is on screen, Discover needs a live yt-dlp search, and the Wails window
isn't reachable headlessly. So the components are mounted in a browser with their
stores replaced.

## Doing one

1. **Read what was asked for.** "The library with a long queue", "the empty
   states", "settings with the EQ off", "an artist page" — that decides the data
   and the views, and nothing else does.
2. **Write the data.** `harness/__preview-app.tsx` has a `DATA` section: track
   list, artists, playlists, search results, what's playing, the EQ curve. It
   ships with a small example — **replace it**, don't work around it. Check the
   state types in `frontend/src/api/` if you're unsure what a store holds; the
   file imports them, so the type-check will tell you either way.
3. **Render**, and **look at every PNG**. Nothing in the pipeline knows what the
   picture is supposed to show — that check is yours.
4. **Leave the harness as you wrote it.** It is the record of what the last
   preview was of, and the starting point for the next one.

```
bun .claude/skills/preview/render.ts [views…] [flags]
```

Views are any `MainViewName` — `library` `discover` `settings` `playlists`
`artists` today — defaulting to `library`. `playlists@1` opens that item's
detail view and writes `playlists-1.png`.

| flag | |
| --- | --- |
| `--out=preview` | where the PNGs go. `--out=assets` when they're being kept. |
| `--scale=1.5` | 1.5 → 1800×1188 |
| `--no-check` | skip the type-check (below). Only while iterating. |
| `--keep` | leave the harness in `frontend/src/` and the vite URL usable, to poke at |
| `--still` | freeze the now-playing bars, which is what makes a render byte-reproducible |

A run is about 16 seconds, 10 of them the type-check.

## Writing the data

The stores are replaced by assigning over their `getSnapshot`. Two rules hold
the whole thing up, and both are invisible until broken:

- **Every stub returns one hoisted constant.** `useSyncExternalStore` compares by
  identity, so building the object inside the arrow is "Maximum update depth
  exceeded", not a render.
- **Nothing may fire an RPC.** `LibraryData` reads off a session *change* and no
  subscriber is ever notified, so the stubs are plain assignments after a static
  import. A new store that fetches on construction would need handling.

Stubbed today: `sessionService`, `binaryService`, `libraryService` (+
`getRemote` and the `getTrack` / `tracksByIds` / `tracksOfArtist` indices), `playlistService`, `artistService`, `discoverService`,
`playerController`, `presenceService`, `importService.jobFor`, and the
equalizer. **That list is what the app needed when it was written, not a
contract** — if a view renders empty, the likely reason is a store nobody
stubbed. The playlist and artist views have no store of their own to stub: both
project the library through those indices, which `LibraryService` builds from a
real payload and so are empty behind a stubbed snapshot.

The type-check is the safety net for all of this, which is why it is on by
default: the harness is copied into `frontend/src/` for the run, so `tsc` sees it
against the app's real types and a store that changed shape is a compile error
rather than a wrong picture.

Conventions worth keeping: names fictional, and artwork as **gradient SVG data
URIs** — no network, nothing copyrighted, and `crossOrigin="anonymous"` on a
`data:` URL still leaves the canvas `lib/coverFit.ts` reads back untainted.
`still()` and `artTrack()` are a pair, so a Discover preview can show both
branches of that measurement.

## How the picture is made

`harness/__preview.html` draws the Windows title bar and holds the app in a
1200×760 **iframe**. The iframe isn't decoration: the app is `h-screen`, and only
inside an iframe does that resolve against something other than the whole page.

`harness/__preview-app.html` **zeroes every CSS transition**: a picture wants
the settled state, and the player bar's cover backdrop cross-fades for 700 ms
behind a two-frame gate, so whether the capture landed before or after it used to
be a coin toss. Keyframe animations are left alone.

| Edge flag | why |
| --- | --- |
| `--window-size=1200,792` | CSS px, not device px: a 32 px title bar over the 760 px client area |
| `--force-device-scale-factor=1.5` | multiplies that into the output, and drives the app's `--dpr` |
| `--default-background-color=00000000` | what leaves the rounded corners cut out of the alpha instead of filled black |
| `--hide-scrollbars` | native scrollbars only; Radix's own are drawn and unaffected |
| `--virtual-time-budget=20000` | a budget, not a sleep: virtual time runs as fast as the page allows, so this costs no wall clock |
| `--run-all-compositor-stages-before-draw` | the frame is fully rasterised, not whatever was ready when the budget ran out |
| `--user-data-dir`, `--screenshot` | must be absolute, or Edge fails with `Zugriff verweigert`; one profile per shot, since a shared one takes a singleton lock |

## What the script checks, and what it can't

Per shot: the file exists, is `rgba`, is the expected size, has a **transparent
corner** (an opaque one means the backdrop broke), and the DOM contains the app
bar's log-out action — which proves `<App/>` mounted rather than the page being
blank or thrown. It also reports if the app's window size in `main.go`
has drifted from what the harness frames.

Nothing is published to `--out` until every shot has passed, so a failed run
can't leave a broken picture under a current-looking name.

**It cannot tell whether the picture shows what you meant.** A view whose store
isn't stubbed renders a photogenic empty state that passes every check above.
Look at the images.

## Gotchas

- Chrome is not installed; Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- ffmpeg is the only image tool here — no ImageMagick, and `convert` on PATH is
  Windows' FAT tool.
- `render.ts` is outside every tsconfig project, so nothing type-checks it. Read
  it if it misbehaves.
- Byte-reproducibility: views with no animation are identical run to run;
  anything showing the now-playing bars needs `--still`; a Discover download
  spinner never is, since `animate-spin` honours no reduced-motion.
- In Git Bash, `"$DIR\\$v.png"` silently yields a literal `$v`; write
  `"$DIR"'\'"$v.png"`.
- The title bar's caption glyphs are Segoe Fluent Icons (`E921` `E922` `E8BB`).
