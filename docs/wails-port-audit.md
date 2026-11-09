# VexWave → Wails v3 / Go: port audit

## Ground rules

These bind every porting session.

1. **Target: Windows / WebView2 only.** No macOS or Linux code, build tags or build assets.
2. **Wails is pinned to exactly v3.1.0** (`github.com/wailsapp/wails/v3 v3.1.0`, `@wailsio/runtime 3.1.0` and the matching `wails3` CLI), built with **Go 1.27** (`go.mod`: `go 1.26.0`, the minimum Wails v3.1.0 requires, plus `toolchain go1.27.0`; CI reads it with `go-version-file: go.mod`). Before any Wails bump, run the `port-sandbox/` suite against the new version in the reference checkout (`go test -race ./...` in `port-sandbox/gotests`, plus the `port-sandbox/cdp` probes; see Port setup), and fix this report wherever the results differ.
3. **This report is the spec. The Electrobun app is the behavioural reference.** Keep it buildable and runnable on `main` until the port matches it feature for feature. Where this report says nothing, do what the Electrobun app does.
4. **Idiomatic Go.** `gofmt`, `go vet` and `go test -race` must pass. Shared state follows the models in §3.4: a new piece of shared state gets a model from that table, never an ad-hoc lock.
5. **`frontend/src/api/rpc.ts` is the only frontend file that imports Wails** (`@wailsio/runtime` or generated bindings).
6. **Data lives in exactly two places** (layout and uninstall rule in §3.11):

   | Location | Holds |
   |---|---|
   | `%LOCALAPPDATA%\Programs\<Product>\` | The app only, installed per user by NSIS, one folder per packaged channel (only stable is packaged for now, §5). No user data. |
   | `%LOCALAPPDATA%\VexWaveData\` | `bin\`: managed binaries (yt-dlp, ffmpeg/ffprobe, deno), shared by all channels. `<channel>\webview\`: the `WebviewUserDataPath` (saved login). `<channel>\imports\`: import staging. |

   Nothing reads or writes `%LOCALAPPDATA%\VexWave`, which the old Electrobun uninstaller deletes (§5).
7. **Reuse the sandbox.** Start each package from its `port-sandbox/gotests` counterpart (map in §6), and move its tests along with it. Don't rewrite them from scratch.
8. **Keep this report true.** Fix wrong information here. When the port finds that reality differs from the plan, update this report in the same change.

---

## Port setup

### Start

The port starts on a new branch from a **fresh `wails3 init -t react` project** (v3.1.0), not by converting the Electrobun project in place.
- **Branch from `main`**, after `6ba637c`, the commit that adds `docs/` and `port-sandbox/` (below: the *reference commit*). Shared history lets the finished port land on `main` as an ordinary merge, and the Electrobun history stays in `git log`. An orphan branch would need `--allow-unrelated-histories` to merge.
- **First commit:** delete the Electrobun tree, except what the table below carries over. Generate the template into the repo root. Add the root `.gitattributes` and `CLAUDE.md` (below), then run `git add --renormalize .` so every committed text file is LF.
- **Trim the template the way `port-sandbox/app` was trimmed:** delete the non-Windows build assets, give `generate:icons` `-macfilename ""`, and delete the demo service, the demo images and the template's styles. In the root `Taskfile.yml`, `APP_NAME` is `VexWave` (the template lowercases it) and `PACKAGE_MANAGER` defaults to `bun`.

### Names

| Item | Value | Where it's set |
|---|---|---|
| Go module | `github.com/VexWave/vex-app` | `go.mod` |
| Company | `realChriss` | `build/config.yml` `info.companyName`, copyright |
| Product (stable) | `VexWave`, installed to `Programs\VexWave` | `build/config.yml` `info.productName` |
| Product (canary, not packaged yet, §5) | `VexWave Canary`, `Programs\VexWave Canary` | its installer config, once canary is packaged |
| Product identifier | `app.vexwave` (an app ID only, not the old uninstaller's registry key) | `build/config.yml` `info.productIdentifier` |
| `UNINST_KEY_NAME` (stable / canary) | `VexWave` / `VexWave Canary`. Set explicitly; the default would be `<Company><Product>` | `project.nsi`, `buildinfo` |
| Release assets | `VexWave-windows-amd64.exe` (the bare exe the updater's default matcher picks, §3.9), `SHA256SUMS`, and `VexWave-installer.exe` (`project.nsi` writes `bin/VexWave-amd64-installer.exe`; CI renames it) for first installs. `SHA256SUMS` is `sha256sum` output for both exes; the provider strips its `*` (`wails:v3/pkg/updater/providers/github/github.go:352-375`). None is `VexWave-Setup.exe` (§5) | `build-windows.yml` |

### Layout: the Wails template's, unchanged

```
main.go, go.mod, go.sum   Go module at the root; main.go embeds frontend/dist (//go:embed all:frontend/dist)
internal/<pkg>/           Go packages (§6)
frontend/                 the React app: package.json, bun.lock, vite.config.ts, tsconfig.json, tailwind + postcss configs, components.json
frontend/src/             the UI (was src/mainview/); the @/ alias points here
frontend/bindings/        generated bindings, committed; CI fails when they drift
build/                    config.yml, Taskfile.yml, appicon.png, windows/ (icon, manifest, info.json, nsis/project.nsi)
Taskfile.yml
contract/                 backend contract, limits generator, test backend (bun; own package.json)
scripts/release.ts
docs/wails-port-audit.md
.github/workflows/, .claude/skills/preview/, README.md, assets/
.gitattributes, .gitignore, CLAUDE.md
```

Why this layout:
- **Wails' tooling assumes it:**
  - every generated frontend task runs in `frontend/` (`install:frontend:deps`, `build:frontend`, `dev:frontend`, `port-sandbox/app/build/Taskfile.yml:13-135,204-229`);
  - `generate:bindings` writes `frontend/bindings` (`:176-191`);
  - `wails3 dev` ignores `frontend` in its Go watcher (`build/config.yml` `dev_mode.ignore`);
  - the template's Vite plugin resolves `wails("./bindings")` relative to `frontend/`.
- **Bumps stay simple:** with no edits to the generated tasks, a Wails bump can regenerate them and compare cleanly against the sandbox. `wails3 update build-assets` rewrites only `info.json`, the manifest and `wails_tools.nsh` (`wails:v3/internal/commands/updatable_build_assets/windows`). `project.nsi`, which carries this app's changes (§3.10, §3.11), is created once and never rewritten (`wails:v3/internal/commands/build_assets/windows/nsis`).
- **The root stays a Go module, and all JS tooling lives in `frontend/`.** Keeping `src/mainview/` at the root would mean editing every frontend task for a `src/` that holds only one half once the bun process is gone.

### What carries over

The Go side is new code. It starts from the sandbox packages (Ground rules 7) and the behaviour in the reference. The UI is not part of the port: the facade (§3.3) keeps its call sites, so it is copied and then changed as §4 lists.

| From `main` | On the branch | Form |
|---|---|---|
| `src/mainview/**` | `frontend/src/**` | Copied, then the §4 changes. `components/ui/` keeps what shadcn generated. |
| `components.json` | `frontend/components.json` | Kept for the shadcn CLI (`bunx shadcn add <component>`, run in `frontend/`). `tailwind.css` becomes `src/index.css`. `tailwind.config` stays `tailwind.config.js`, now `frontend/`'s. The `@/` aliases are unchanged, because `@/` now points at `frontend/src`. The CLI resolves them through `frontend/tsconfig.json`'s `paths`. The project stays on Tailwind 3, and the CLI keeps adding Tailwind 3 components to it. |
| `src/shared/rpcSchema.ts` | `frontend/src/api/types.ts` | The data types only (§3.3). The `PlayerRPC` schema is dropped. |
| `src/shared/limits.ts` | `frontend/src/lib/limits.ts` + `limits.gen.ts` | The constants are generated into `limits.gen.ts` by the same generator that writes `internal/backend/limits_gen.go` (§3.14), so they're no longer hand-mirrored. `limits.ts` keeps `base64Length` and the decoded-byte forms derived from the generated caps. |
| `contract/contract.ts` | `contract/contract.ts` | Unchanged. It is the backend's API spec that the hand-written client follows, and the limits generator's input. `contract/package.json` holds `zod` and `@ts-rest/core`, so the frontend no longer depends on them. |
| `port-sandbox/limits/gen.ts` | `contract/gen-limits.ts` | Rewritten to emit the Go and TS files. CI checks for drift. |
| `scripts/test-server.ts` | `contract/test-server.ts` | Unchanged apart from its import path. It is the throwaway backend for manual end-to-end checks (§7). |
| `port-sandbox/gotests/<pkg>` | `internal/<pkg>` | Code and tests, per the §6 map. The comparisons that need the old app's sources stay in the reference (§6). |
| `scripts/release.ts` | `scripts/release.ts` | Same procedure, but writes the version into `build/config.yml` (§3.10). |
| `.github/workflows/*` | same paths | Rewritten. The Go code imports `golang.org/x/sys/windows`, so CI runs on `windows-latest`: tsc, `go vet`, `go test -race`, and drift checks for the bindings and limits. In `build-windows.yml`, a `v*` tag builds stable and publishes it, as today. The manual canary run is left out until canary packaging is designed (§5). The workflow keeps its SHA-pinned actions and `persist-credentials: false`, and runs `wails3 package` instead of the fuse step. |
| `.claude/skills/preview/` | same path | Paths moved to `frontend/`. The `window.__electrobun` stub is removed (§4). |
| `assets/vex-logo.png` | `build/appicon.png` | The source for `wails3 generate icons`. |
| `README.md`, `assets/*.png` screenshots | same paths | The stack badges are updated. |
| `docs/wails-port-audit.md` | same path | The spec (Ground rules 3, 8). |

**Frontend toolchain:** start from the template's `frontend/package.json`, which brings Vite, `@vitejs/plugin-react` and the Wails Vite plugin at the versions v3.1.0 was tested with. Add the app's runtime dependencies at their current `package.json` versions, and keep TypeScript at the repo's version. `noUnusedParameters` stays off, as in the template: the generated `Nullable<T>` binding never uses `T`. Checked in the first commit: `wails3 build` and `bunx tsc --noEmit` pass, and the preview skill's library and settings renders are byte-identical to the reference checkout's (discover differs only by its download spinner, which never renders the same twice).

**Not carried over:**
- **`src/bun/**`:** reimplemented in Go.
- **`electrobun.config.ts` and `llms.txt`:** the identifier, names and channels move into `build/config.yml` and `buildinfo`.
- **`scripts/fuse-installer.ts`, `scripts/stamp-win-icons.ts` and `scripts/tsconfig.json`:** the second TS project exists only because bun's globals collide with the DOM lib.
- **`assets/vex-logo.ico`:** generated from `appicon.png`.
- **The root `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js` and `postcss.config.js`:** replaced by `frontend/`'s, with content globs and the `@/` alias pointing at `frontend/src`. These packages leave: `electrobun`, `rcedit`, `@types/three`, `@types/bun`, `music-metadata`.
- **`.gitignore`:** the template's, plus `/preview/` for the preview skill's output and `contract/node_modules`.
- **All four `CLAUDE.md` files.** They describe the Electrobun app. The replacement is below.
- **`port-sandbox/`:** stays on `main`. Its probe app, CDP harness, ranking capture and music-metadata comparison need the old app's sources and root `node_modules`, so they run from the reference checkout.

### Root `CLAUDE.md`

The first commit creates one root `CLAUDE.md` with exactly this content, and no folder-level ones. Porting sessions start cold, and two facts can't be read from the code: this report is the spec, and the reference checkout lives at `../vex-app-electrobun`. The rest are the old files' conventions that still apply.

```markdown
# CLAUDE.md

VexWave: a Windows desktop music player on Wails v3.1.0 (Go 1.27, WebView2), with the React UI in `frontend/`.

- **Spec:** `docs/wails-port-audit.md`. Its Ground rules bind every change. Where it says nothing, do what the Electrobun app does.
- **Behavioural reference:** the Electrobun app, checked out at `../vex-app-electrobun` (the report's Port setup says how to create it). The report's `file:line` references resolve there.
- **bun only:** npm and node aren't installed. Use `bun` and `bunx`, including for the shadcn CLI (`bunx shadcn add <component>` in `frontend/`).
- **Indentation:** tabs in TS, JS, CSS and JSON. Go is `gofmt`.
- **Comments:** only for a fact from outside the repo (an upstream bug, OS or browser behaviour, a spec, where a magic number comes from) or for a trap where code looks wrong or removable but isn't. One line, two at most, in the present tense, stating the reason directly. History goes in commit messages. `frontend/src/components/ui/` keeps what shadcn generates.
- **Keep this file short:** structure, rules that span files, and what the code can't say. The spec lives in the report.
```

### Root `.gitattributes`

The first commit also adds this file, so text files stay LF on Windows checkouts, both locally and in CI. On `windows-latest`, `actions/checkout` converts text files to CRLF by default, which a `gofmt` check reports as a diff. The binary lines cover every binary type the branch holds: the PNG screenshots and `appicon.png`, `icon.ico`, the `woff2` wordmark font, and the template's `ttf` and `jpg` files while they're still there. They also cover the WebView2 bootstrapper `.exe` that packaging writes into `build/windows/nsis`.

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.ttf binary
*.woff2 binary
*.exe binary
```

### Reaching the Electrobun app

Once the branch no longer contains the Electrobun app, porting sessions use a separate checkout of the reference commit, next to the repo:

```
git worktree add --detach ../vex-app-electrobun 6ba637c
cd ../vex-app-electrobun && bun install
```

- **References:** `file:line` references in this report point to `main` at `77faba4`. The reference commit `6ba637c` adds only `docs/` and `port-sandbox/` on top of it, so every reference resolves in the checkout: `StreamProxy.ts:108` is `../vex-app-electrobun/src/bun/StreamProxy.ts:108`. Without a checkout, use `git show 77faba4:src/bun/StreamProxy.ts` or `git grep <pattern> 77faba4`.
- **Behaviour:** run the Electrobun app there (`bun run dev:hmr`) to compare behaviour side by side, against the same backend.
- **Sandbox:** `port-sandbox/` runs there too: the Go suite, the CDP probes, the ranking comparison and the Wails-bump re-runs (Ground rules 2).
- **Wails sources:** `wails:v3/<path>` references resolve in the Go module cache at `$(go env GOMODCACHE)/github.com/wailsapp/wails/v3@v3.1.0/<path>`. `wails:docs/…` needs a clone of the `v3.1.0` tag.
- **Keeping it current:** the checkout stays at the reference commit. If the Electrobun app on `main` changes during the port, move the checkout and this report's references together (Ground rules 8).

---

Line references into this repo are against `main` at `77faba4` (v0.6.1). On the port branch, read them in the reference checkout (Port setup).

**How this was verified.**
- **Wails version:** **v3.1.0** (`wails3 version`). v3.0.0 was the first stable release (`wails:docs/mpress/content/status.md:8`). Every Wails claim was checked against the v3.1.0 tag (commit `4b454e4`, 2026‑11‑01). `wails:<path>:<line>` points into that tree.
- **Go version:** Wails v3.1.0 requires Go 1.26 (`go 1.26.0`, `toolchain go1.26.10` in its `go.mod`). The sandbox ran on Go 1.27.0: a `toolchain` line never downgrades, so `GOTOOLCHAIN=auto` kept the local 1.27.
- **Sandbox:** behaviour was proven in `port-sandbox/` in this repo (how to run it: `port-sandbox/README.md`). It stays on `main`; the port branch reaches it through the reference checkout (Port setup):
  - `port-sandbox/gotests/`: Go tests, all passing under `go test -race`.
  - `port-sandbox/app/`: a Wails app from `wails3 init -t react` (in v3.1.0 the TypeScript template is called `react`). Its non-Windows build assets are removed, and `wails3 build` still works.
  - `port-sandbox/cdp/`: Playwright `connectOverCDP` probes that drive that app inside WebView2 157.
  - `port-sandbox/ranking/`: the TS-vs-Go ranking comparison.
- **What isn't verified yet:** §7 lists every open check, with the port phase where it gets tested and how. Other sections point to it.

---

## 1. Summary

**Overall difficulty: medium.** Most of `src/bun/` is plain I/O that the Go standard library covers directly, and several Bun workarounds disappear (§3.6, §3.7). If `api/rpc.ts` becomes a thin wrapper over the generated bindings, the React app keeps its ~30 RPC call sites. The real work is in three places where a line-by-line translation would be wrong.

### Biggest risks

1. **Bun's stream tee does not translate to Go.** The Wails asset server can't stream on Windows: a route that flushes a first chunk and writes the rest 3 s later reached `fetch` only after the full 3 006 ms (`port-sandbox/cdp/probe-bridge.ts`, `wails:v3/internal/assetserver/webview/responsewriter_windows.go:36-43,67`). So the loopback `http.Server` stays, as decided. A Go tee that writes to the client inline stalls, though. Chromium stops reading a media connection once its buffer is full but leaves it open, and the cache fill stalls with it. Proven in `port-sandbox/gotests/media/server_test.go` (`TestPausedClientDoesNotStallFill`) and seen in WebView2, where the element buffered only seconds 0–87 of the first request. The design that works is **one shared download per track**, served to every request through `http.ServeContent`. It passes the full WebView2 run. → §3.1
2. **The bridge caps a call at 64 MiB, and large calls are slow.** In the running app (`port-sandbox/cdp/probe-bridge.ts`):
   - a 63 MiB string argument succeeds;
   - 64 MiB fails with `Invalid runtime call: assembled body too large`;
   - the 100 MiB of base64 that a 75 MiB track becomes today also fails;
   - even a 48 MiB call took 7.4 s.

   Uploads go by file path: Go streams the file to the backend without holding it in memory (0.2 MiB allocated for a 75 MiB track). → §3.2
3. **Every bound call runs on its own goroutine.** Three concurrent 1 s calls finished in 1 008 ms. The checks Bun's single event loop made safe become races: a 1:1 check-then-act port of `unlessInstalling`/`ytDlpBusyReason` let an import and an install overlap in 97 of 2 000 rounds (`port-sandbox/gotests/busy/busy_test.go`). Each piece of shared state gets its own model (§3.4), and each model is proven with `-race`.
4. **Generated binding types don't match what the components expect.** `wails3 generate bindings -ts -i` (`port-sandbox/app/frontend/bindings/example.com/probe/models.ts`) produces:
   - every slice and map as `T[] | null`;
   - `[]byte` as a base64 `string | null`;
   - a type with a custom `MarshalJSON` (needed for the contract's absent-vs-null rule) as `any`.

   The frontend keeps hand-written types behind the facade. → §3.3

### Decisions this plan is built on

| Decision | How the port implements it | Section |
|---|---|---|
| Windows / WebView2 only; Wails v3.1.0 pinned, Go 1.27 | Ground rules 1–2 | Ground rules |
| Audio through a loopback Go `http.Server` | One shared download per track plus an LRU cache; seeks past the download are forwarded as Range requests. The backend sends `Content-Length` on the audio `200` | §3.1 |
| Uploads by file path, still base64 inside JSON | Native dialog and finished imports give paths; Go probes with ffprobe and streams the base64 JSON body | §3.2 |
| Concurrency by choice of model, not blanket locks | `atomic.Pointer` with CAS, a mutex registry, worker goroutines, `context` cancellation, an actor, and a cross-process file lock for the shared `bin\` | §3.4 |
| Search ranking ported properly | Lookbehind replaced by code, rune lengths, Unicode case folding, stable sort | §3.5 |
| Saved login stays in webview storage | Persistence verified; `WebviewUserDataPath` = `VexWaveData\<channel>\webview` | §3.8 |
| Only stable is packaged and released for now | The channel stays in the code (dev/stable/canary in `buildinfo`, `VexWaveData\<channel>\`, the uninstall rule), so canary can be added without redesign | §5 |
| Canary builds don't self-update | Only stable installs updates; a canary build never sets up the updater | §3.9 |
| Two data locations: the install folder and `VexWaveData` | One NSIS install folder per packaged channel; uninstalling a channel removes `VexWaveData\<channel>\`, plus `bin\` and the root when it's the last channel installed | §3.11 |
| Not ported: migration, drag & drop, macOS, signing | See §5 | §5 |

---

## 2. Feature table

Evidence: **test** = a sandbox test or probe (path given); **src** = Wails v3.1.0 source or docs; **std** = Go standard library behaviour, exercised in a test where noted; **n/a** = no Wails/Go behaviour involved.

| Area | Current implementation | Problem it solves | Wails/Go approach | Better than 1:1? | Risk | Evidence |
|---|---|---|---|---|---|---|
| App bootstrap & window | `src/bun/index.ts:186-202`, `electrobun.config.ts` | One 1200×800 window with RPC | `application.New(Options{Services…})` + `app.Window.NewWithOptions` | Same | low | test (`port-sandbox/app/main.go`) |
| Dev server / HMR | `index.ts:14-31`, `package.json` scripts | Vite in dev, bundle otherwise | `wails3 dev` + `FRONTEND_DEVSERVER_URL`; `production` build tag; Taskfile `PACKAGE_MANAGER=bun` | Yes: no runtime probe of :5173, no build that ships stale `dist/` | low | src (`v3/internal/assetserver/build_dev.go:161`); `wails3 build` with bun: test. HMR: §7 |
| RPC transport | `src/shared/rpcSchema.ts:260-315`, `api/rpc.ts`, `index.ts:125-184` | Typed request/response | Bound methods + generated TS; facade keeps `{ok}\|RpcFailure` | Yes: types generated from Go | med | test (`probe-bridge.ts`) |
| RPC timeout | `maxRequestTime: 120_000` (`index.ts:127`, `rpc.ts:5`) | Electrobun's 1 s default | No call timeout; `ctx` cancelled by `promise.cancel()` | Yes | low | test: a 9 s call completed; `cancel()` → Go saw `context canceled` |
| Pushed messages | `rpc.send.*` (5 kinds) | Progress, expiry, presence status | `application.RegisterEvent[T]` + `app.Event.Emit`; typed names in `bindings/events` | Same | low | test (`probe-bridge.ts`: typed events received) |
| Error model | `RpcFailure` (`rpcSchema.ts:24-31`), `ApiClient.ts:425-487` | 401→login, 429 `Retry-After`, 413/407 text | Go error type; promise rejects with `RuntimeError`, `cause` = JSON of the error | Same, behind facade | low | test: `cause` = `{status, retryAfterSec, error}`; plain `errors.New` → `cause: {}` |
| Backend client | `ApiClient.ts`, `contract/contract.ts` | Typed backend calls | Hand-written `backend.Client` on `net/http` (13 routes) | Yes: one HTTP path | med | npm registry: every `@ts-rest/open-api` dist-tag peers `zod ^3` |
| Payload limits mirror | `src/shared/limits.ts`, startup check `ApiClient.ts:39-46` | Refuse oversize payloads early | `limits_gen.go` and the frontend's `limits.gen.ts` generated from the contract with zod 4's `z.toJSONSchema` | Yes: build time, no hand mirror | low | test (`port-sandbox/limits/gen.ts` produced all 8 limits) |
| Outbound proxy | `ApiClient.ts:48-78`, `ytDlp.ts:11-28` | User/corporate proxy | `httpproxy.Config{…}.ProxyFunc()` (honours `NO_PROXY`, bypasses loopback) | Same | low | test (`port-sandbox/gotests/netx`) |
| Proxy 407 on HTTPS | `ApiClient.ts:430-436` | Clear "proxy auth" error | `Transport.OnProxyConnectResponse` returns a typed error | Yes: typed | low | test (`TestProxy407Typed`) |
| Certificate errors | regex on text, `ApiClient.ts:406-421` | Explain cert failures | `errors.As` → `*tls.CertificateVerificationError`, `x509.UnknownAuthorityError`, `x509.HostnameError` | Yes | low | test (`TestCertErrorsTyped`) |
| Saved login | `SessionService.ts:23-55`, `storage.ts:75-79`, `ApiClient.ts:105-110` | Survive restarts | Unchanged (webview storage + `restoreSession`); `WebviewUserDataPath` = `VexWaveData\<channel>\webview` | Same | low | test (`probe-persist.ts`) |
| Data folders | Electrobun install tree `%LOCALAPPDATA%\app.vexwave\<channel>`, shared `%LOCALAPPDATA%\VexWave\{bin,imports}`, CEF profile | Where the app and its data live | `%LOCALAPPDATA%\Programs\<Product>` + `%LOCALAPPDATA%\VexWaveData` (Ground rules 6) | Yes: out of the old uninstaller's reach, per-channel data | low | test (`port-sandbox/gotests/datadirs`) |
| Audio stream proxy | `StreamProxy.ts`, `TrackCache.ts` | Token-free loopback URLs, Range, CORS for Web Audio | Loopback `http.Server`; shared download per track; `http.ServeContent` | Yes (§3.1) | **high** | test (`media` tests + `probe-audio.ts`) |
| `/head` level scan | `StreamProxy.ts:285-328`, `player/programLevel.ts:47` | First 1.5 MB without a second download | Reads the shared download; starts it if first, so no 2 s wait | Yes | low | test (`TestHeadSharesDownload`) |
| Image proxy + `?v=` | `StreamProxy.ts:254-283`, `imageVersion.ts` | Covers cached per content hash | Same handler; ETag/304 passthrough | Same | low | n/a (direct port; not exercised) |
| Track cache | `TrackCache.ts` | 256 MiB LRU of whole tracks | `container/list` LRU; `http.ServeContent` answers Range | Yes: drops `respondFromCache` | low | test (`TestCacheRanges`) |
| Upload | `UploadService.ts:89-245`, `lib/utils.ts:49-60`, `ApiClient.ts:166-187` | Local files into the library | By path: ffprobe metadata, streamed base64 JSON | Yes (§3.2) | **high** | test (`port-sandbox/gotests/upload`, `probe-bridge.ts` cap) |
| File pick | `AddTracksButton.tsx:16-18` | Choose files | `app.Dialog.OpenFile()…PromptForMultipleSelection()` | Yes: real paths | low | src (`v3/pkg/application/dialogs.go:234-337`); the dialog was checked by hand on the port |
| Save track to disk | `TrackDownloader.ts` | Copy a track to a folder | Directory dialog + `io.Copy` from cache or shared download; `O_EXCL` names | Yes | low | src / std |
| Managed binaries | `BinaryManager.ts` | yt-dlp, ffmpeg/ffprobe, deno | Same; `archive/zip` instead of `tar`; `os.Rename` replaces; `VexWaveData\bin` shared by all channels under a cross-process `bin\.lock` | Yes | med | test (`TestRenameReplaces`, `datadirs/binlock_test.go`) |
| yt-dlp plumbing | `ytDlp.ts` | UTF-8, PATH, proxy env, lines, failures | `exec.CommandContext` + `CREATE_NO_WINDOW`; append `PATH=` | Yes: simpler | med | test (`port-sandbox/gotests/winproc`) |
| URL import | `UrlImporter.ts`, `ImportService.ts` | One import at a time | Worker goroutine; output staged straight into upload | Yes | med | test (`port-sandbox/gotests/importer`) |
| Discover search | `MediaSearch.ts` | Newest query wins | `context.WithCancelCause` | Yes | low | test (`port-sandbox/gotests/search`) |
| Search ranking | `searchRanking.ts` | Re-rank one page | Go port with rune lengths, case folding, stable sort | Yes (§3.5) | med | test (`port-sandbox/gotests/ranking`) |
| Busy flags & quit guard | `index.ts:77-123` | No yt-dlp overwrite while running; no quit mid-transfer | `busy.Registry.Acquire(kind)`, atomic | Yes: race-free | med | test (`busy_test.go`) |
| Session swap | `ApiClient.ts:95-151` | Login/logout/proxy change while requests run | Immutable session behind `atomic.Pointer`, CAS | Yes: fixes a stale-401 logout | med | test (`port-sandbox/gotests/session`) |
| Discord Rich Presence | `DiscordPresence.ts` | Activity card over local IPC | One actor goroutine; `winio.DialPipeContext` on the named pipe | Yes: no timer fields | med | test (`presence`, `pipe`); live Discord: §7 |
| App updater | `AppUpdater.ts`, `download.ts`, `appRelease.ts`, `detachedHelper.ts` | Download, verify, install, relaunch (stable only) | `app.Updater` + GitHub provider + `SHA256SUMS`, `WindowNone`, own banner; never set up on canary | Yes: no PowerShell | med | test (`port-sandbox/gotests/updatertest`); `Restart` swap: §7 |
| Uninstaller | `Uninstaller.ts`, `detachedHelper.ts` | Remove an install the app can't delete | NSIS `uninstall.exe /S` from a Go helper mode; the uninstaller runs the app's `--remove-data` mode | Yes | med | test (`datadirs_test.go`, job state); NSIS run: §7 |
| Dark title bar & icon | `WindowChrome.ts`, `scripts/stamp-win-icons.ts` | Dark caption; embedded icon | `WindowsWindow.Theme` + `CustomTheme`; icon via build assets | Yes: deleted | low | src (`webview_window_options.go:366-372,439-450`); rendering: §7 |
| HiDPI | `index.ts:204-222`, `bundleCEF`, `lib/devicePixelRatio.ts` | electrobun#324 | Wails manifest declares `permonitorv2` | Yes: deleted | low | test: `devicePixelRatio` 1.25 at 125 % scaling; WebView2 started with `--embedded-browser-webview-dpi-awareness=2` |
| Installer | `scripts/fuse-installer.ts`, `build-windows.yml` | One setup exe | `wails3 package` → NSIS, per-user scope | Yes: deleted | med | src; build and run: §7 |
| Version & release | `scripts/release.ts:6-9`, `build-windows.yml:71-81` | Version from tag | `build/config.yml` `info.version` | Same | low | src |
| Channels | `index.ts:18`, `AppUpdater.ts:38-39` | dev/canary/stable | the `stable` build tag; per-channel install folder from the installer, Uninstall key in `buildinfo`, and `VexWaveData\<channel>\`; canary doesn't self-update. Only stable is packaged for now (§5) | Same | low | n/a |
| Web Audio over loopback | `AudioPlayer.ts:38-41`, `StreamProxy.ts:151-168` | `crossOrigin` media needs ACAO | Same headers from Go | Same | low | test: analyser peak 0.125 (untainted) |
| Single instance | absent | Two copies race on `bin/`, imports | `Options.SingleInstance` | New | low | test: second launch exits in ~1 s, first gets its args |
| Type-check / CI | `.github/workflows/ci.yml` | tsc both projects | On `windows-latest`: tsc (`frontend/`, `contract/`), `go vet`, `go test -race`, bindings and limits freshness | Yes | low | n/a |
| Preview skill | `.claude/skills/preview/SKILL.md:87-92` | Headless renders | Drop the `window.__electrobun` stub | Yes | low | test: runtime + bindings import fine in headless Edge |

---

## 3. Detailed sections

### 3.1 Stream proxy — **high**

**Current code.**
- **Server:** `Bun.serve` on `127.0.0.1:0` (`src/bun/StreamProxy.ts:108-120`), every path prefixed with a random secret (`:97`, `:122-125`).
- **`/track/<id>`:** forwards `Range` and passes `content-type`/`content-range`/`accept-ranges` (`:15-22`). A whole-file request is `tee()`d into a `TrackDownload` that fills `TrackCache` (`:364-402`). A seek during that download goes straight to the backend (`:370-371`).
- **`/head`:** answered from the cache or the running download. It waits up to 2 s for a download to start, else makes its own `bytes=0-1499999` request (`:285-328`).
- **Other routes and headers:** images (`:254-283`), finished imports (`:173-185`), `access-control-allow-origin: *` everywhere (`:151-168`).

**Why it was built this way.** No CORS to the backend, and no token in the DOM. Track bytes should be fetched once and shared by the element, the level scan and save-to-disk (`src/bun/CLAUDE.md` "Server I/O").

**What a 1:1 port breaks.**
- **The asset server is no alternative.** Its Windows response writer collects the body and hands it over only in `Finish` (`wails:v3/internal/assetserver/webview/responsewriter_windows.go:21,36-43,67`). Measured: first chunk at 3 006 ms (`port-sandbox/cdp/probe-bridge.ts`, `assetServerStreaming`).
- **The tee stalls.** `ReadableStream.tee()` buffers the slower branch without limit, so Bun's cache branch never waits for the element. A Go handler that copies the upstream body into both the cache buffer and the `ResponseWriter` blocks as soon as Chromium stops reading. Chromium does stop: in WebView2 the element buffered seconds 0–87 of 240, then sat on the open connection. With the inline tee, `TestPausedClientDoesNotStallFill` failed after only 1.1 MB of a 6 MB track. Detaching the copy into a goroutine doesn't help either: the goroutine still has to hold the client's bytes somewhere.
- **Gzip:** Go's `http.Transport` adds `Accept-Encoding: gzip` on its own, but only to requests **without** `Range` (`port-sandbox/gotests/netx`, `TestRangeRequestsSkipAutoGzip`). When the server compresses, Go decodes the body and reports `ContentLength == -1` (`TestDefaultTransportAddsGzip`). The shared download sends no `Range` and needs the backend's `Content-Length` to size its buffer, so the stream client sets `DisableCompression: true` (`TestDisableCompression`).
- **`NO_PROXY`:** `http.ProxyURL` proxies every host. `httpproxy.Config{…NoProxy}.ProxyFunc()` honours suffix rules and never proxies `127.0.0.1`/`localhost` (`TestNoProxy`).
- **Timeouts:** Go's `http.Server` has no idle ceiling like Bun's 255 s. Set `ReadHeaderTimeout` and no `WriteTimeout`, so paused media connections survive.

**Recommended design: one shared download per track** (`port-sandbox/gotests/media/server.go`, 417 lines including the probe's event logging; `StreamProxy.ts` + `TrackCache.ts` are about 560).
- **The download:** the first request for a track, element or `/head`, starts a `download`. It is a goroutine under a session-scoped context, never a request's, and fetches `GET /track/:id/audio` (the token raw in `Authorization`, as `contract.ts` has it) without `Range` into a buffer pre-sized from `Content-Length`, which the backend sends on that `200`. Each append closes and replaces a `changed` channel.
- **Serving requests:** every request reads it through a `progressive` `io.ReadSeeker` whose `Read` blocks until the bytes arrive (or the request context ends). `http.ServeContent(w, r, "", time.Time{}, reader)` then answers single and multi-range, 416 and `Content-Length`. That replaces `respondFromCache`/`parseRange` (`TrackCache.ts:52-96`).
- **Seeking:** a request starting more than 1 MiB past the downloaded bytes is forwarded as its own upstream Range request on `r.Context()`, so aborting it cancels the upstream. A seek back into downloaded bytes is served locally.
- **When the download completes:** the buffer moves into the LRU cache.
- **Safety net, an edge case:** a response the shared download can't use makes every request fall back to per-request forwarding: a non-`200`, a missing `Content-Length` (for example a reverse proxy that re-encodes the audio), or a track bigger than the cache. Playback and seeking still work, but nothing is shared or cached, and each request costs one extra upstream request that is opened and dropped (`TestNoContentLengthFallsBackToForwarding`: 2 requests, 4 backend requests). The backend sends `Content-Length`, so this path is not expected in normal use.
- **`/head`:** reads the first 1.5 MB of the same download. Because `/head` can start the download itself, `TrackDownload.head`, `expect()` and the 2 s timer (`StreamProxy.ts:40-92,300-315`) go away.
- **Session changes:** cancel the session context, clear the downloads and the cache (`syncCacheToAuth`, `:356-362`). `evictTrack` (`index.ts:139-143`) carries over.

**Evidence (all `-race`, `port-sandbox/gotests/media/server_test.go`):**
- Range answered with the right headers;
- the download outlives an aborted client and fills the cache;
- a paused client doesn't stall the fill;
- a seek ahead is forwarded and cancellable;
- a seek behind is served locally with no new upstream request;
- `/head` shares the download in either arrival order (one backend request);
- `ServeContent` handles every Range form;
- a session change stops the download;
- a response without `Content-Length` falls back to forwarding, and the bytes stay intact.

**WebView2 end to end** (`port-sandbox/cdp/probe-audio.ts`, 9.6 MB MP3, backend throttled to 512 KiB/s):

| Step | Result |
|---|---|
| Play | `playing` after 169 ms, with 240 KB of 9.6 MB downloaded |
| `/head` | Joined the same download (decoded 37 s of audio) |
| Web Audio | Analyser peak 0.125 through `createMediaElementSource`, so the `crossOrigin` stream is untainted |
| Seek to 200 s | Forwarded as `Range: bytes=7995392-` → 206; playing at 201.5 s after 1.5 s |
| Seek back to 10 s | Served from the shared download, no backend request |
| Switch track | The forwarded request ended with its upstream cancelled |
| Replay + seek after the download finished | 0 backend bytes (served from cache) |
| Backend requests in total | 3 (the inline-tee version needed 4) |

**Is the shared download worth it versus plain range forwarding?** Plain forwarding is about 40 lines, but it costs:
- a full re-download on every replay;
- a second 1.5 MB request per track for `/head`;
- a full extra download for save-to-disk;
- a new request on every seek back.

Keeping "fetched once" (the module's own rule) without the stall needs a buffer that readers consume at their own pace, and that buffer *is* the shared download. **Recommendation: shared download.** It's the simplest design that keeps the current behaviour, and it adds local seek-back and drops the head timer.

**Other routes.**
- **Images:** same handler shape (forward `If-None-Match`, keep `cache-control` only for versioned URLs).
- **`/import/<id>`:** goes away, because imports are staged in Go (§3.2).
- **New route:** `/staged/<id>/cover` serves the cover extracted at staging time for the review dialog.

### 3.2 Uploads by file path — **high**

**Current code.**
- **Sources:** `<input type="file">` (`AddTracksButton.tsx:16-18`), HTML5 drop (`App.tsx:46-50`, dropped, §5), and finished imports fetched back as a `Blob` (`ImportService.ts:143-158`).
- **Staging:** `UploadService.enqueue` filters by MIME type, checks `MAX_AUDIO_BYTES`, then reads title, duration and picture with `music-metadata` (`UploadService.ts:93-125`).
- **Sending:** `confirm` turns the whole file into base64 (`lib/utils.ts:49-60`) and sends it inside `bun.uploadTrack` (`UploadService.ts:216-222`).

**What breaks.** The cap is 64 MiB of assembled request body, `maxAssembledBytes` (`wails:v3/pkg/application/transport_http.go:24-25,41`). Bodies above 512 KiB are chunked to stay under WebView2's ~2 MB request limit (`wails:v3/internal/runtime/desktop/@wailsio/runtime/src/runtime.ts:20-21,160,189-224`). Measured in the running app (`probe-bridge.ts`):

| Call payload | Result |
|---|---|
| 1 MiB | ok, 165 ms |
| 48 MiB | ok, **7.4 s** |
| 63 MiB | ok, 9.2 s |
| 64 MiB | `assembled body too large` |
| 75 MiB track as base64 (100 MiB) | `assembled body too large` |

Responses are not capped: a 100 MiB return value arrived in 1.4 s.

**Design.**
- **`Uploads.Pick()`:** opens `app.Dialog.OpenFile().CanChooseFiles(true).AddFilter("Audio", "*.mp3;*.m4a;*.flac;*.ogg;*.opus;*.wav;*.aac;*.mp4").PromptForMultipleSelection()` (`wails:v3/pkg/application/dialogs.go:234,307,318`). It passes the returned paths to `Stage`. Checked by hand on the port, as was the save-to-disk folder picker.
- **`Stage(paths)`:**
  - `os.Stat` refuses files over `MaxAudioBytes` before reading (`TestTooLargeRefusedBeforeReading`).
  - `ffprobe -print_format json -show_format -show_streams` gives the title (format tags, else the audio stream's tags, else the filename) and the duration.
  - The `attached_pic` stream is copied out with `ffmpeg -map 0:<index> -c copy -f image2pipe -`.
  - ffprobe is always installed before the UI opens (`App.tsx:52`, `BinaryManager.ts:341-353`). Its spawns hold the shared bin lock like every managed binary (§3.13).
  - "Has an audio stream" replaces today's MIME filter. A file without one, or one that can't be read, comes back with an `error` and shows as a failed row, like a file over the limit; nothing is dropped silently.
  - `Stage` and `Cover` are marked `//wails:ignore`, so they stay out of the generated bindings; only `Pick`, `Confirm` and `Discard` are for the webview. Skipped and cancelled reviews call `Discard`.
- **Finished imports:** the importer writes to `VexWaveData\<channel>\imports\` (today a single `%LOCALAPPDATA%\VexWave\imports` shared by all channels, `UrlImporter.ts:58`). It knows its output path (`UrlImporter.ts:134,177`) and calls `Stage` itself. `ImportService.stage()`'s fetch-into-Blob (`ImportService.ts:143-167`) is deleted.
- **`Confirm(stagedID, edits)`:**
  - **Format:** base64 inside JSON stays, because it is the backend's current contract. If the backend later adds a raw or multipart upload endpoint, only `Confirm`'s body builder changes.
  - Builds the contract body (`contract.ts:33-42`) as `json.Marshal(meta)` minus the closing brace, then `,"data":"`, then the file through `base64.NewEncoder` over an `io.Pipe`, then `"}`.
  - `Content-Length` is exact: prefix + `base64.StdEncoding.EncodedLen(size)` + 2.
  - Evidence (`port-sandbox/gotests/upload/upload_test.go`): a 75 MiB file produced a 104 857 699-byte body, decoded byte-identical by `encoding/json`, with **0.2 MiB** allocated during the upload.
- **Queue:** uploads run one at a time in confirm order: each `Confirm` waits for the done channel of the one confirmed before it, and holds a `busy.Transfer` token from the moment it's queued (`TestConfirmQueue`). The webview calls `Confirm` as soon as a track is confirmed, so its own queue goes. That closes the gap `AppUpdateService.ts:66-73` works around ("Bun sees only the upload in flight, not the queue behind it").
- **Covers picked in dialogs** (`ArtistDialog.tsx:168`, `EditTrackDialog.tsx:176`, `PlaylistDialog.tsx:179`, `UploadReviewDialog.tsx:172`) stay browser `File` → base64 → binding. They are ≤ 10 MiB of base64 (`limits.ts:6`): under the cap, about 1.5 s worst case at the measured rate.

**ffprobe vs `music-metadata`** (`port-sandbox/gotests/upload/probe_test.go`, ffmpeg-generated fixtures in `port-sandbox/fixtures/`):

| File | Title | Duration (ffprobe / music-metadata) | Cover |
|---|---|---|---|
| tagged.mp3 (ID3v2.3, JPEG) | identical, accents intact | 240 000 / 240 039 ms | identical 765 bytes |
| tagged.m4a | identical | 200 000 / 200 023 ms | none / none |
| tagged.flac | identical | 180 000 / 180 000 ms | none / none |
| untagged.ogg | filename fallback (both) | 10 000 / 10 000 ms | none / none |

The ≤ 40 ms duration differences are below the contract's resolution of interest. ffprobe adds no dependency, and `music-metadata` doesn't carry over (Port setup).

**Alternative considered:** POST the raw bytes from the webview to a `/upload` route on the loopback server. It keeps `<input type="file">` and `music-metadata`, but adds a second write surface to the loopback server, a CORS preflight, and keeps the import Blob round trip. By path is simpler.

### 3.3 RPC layer, errors and types — **med**

**Wails mechanics, verified in the running app** (`port-sandbox/cdp/probe-bridge.ts`):
- **Calls:** each call runs on its own goroutine (`wails:docs/mpress/content/concepts/bridge.md:233,295`). Three concurrent 1 s calls finished in 1 008 ms.
- **Cancellation:** a call returns a `CancellablePromise`. `cancel()` sends `CancelCall` (`wails:v3/internal/runtime/desktop/@wailsio/runtime/src/calls.ts:25,100-103`), and the Go `ctx` reported `context canceled`. The JS side rejects with `CancelError: Promise cancelled.`
- **Errors:** a returned error rejects with `RuntimeError`. `message` is `err.Error()`, and `cause` is the error marshalled with `encoding/json` (`wails:v3/pkg/application/bindings.go:37`): `{status:429, retryAfterSec:30, error:"…"}` for a struct with json tags, `{}` for `errors.New`. `ServiceOptions.MarshalError` can override it (`wails:v3/pkg/application/services.go:31-39`).
- **Events:** `application.RegisterEvent[T](name)` (`wails:v3/pkg/application/events.go:327`) produces typed name constants in `bindings/events`. `Events.On(name, ev => ev.data)` received exactly the emitted structs.
- **No call timeout:** a 9.2 s call completed.
- **Ordering:** a call's reply and an event emitted after it can reach the webview in either order (§3.7, status ordering).

**Facade.** `api/rpc.ts` (`frontend/src/api/rpc.ts`) stays the only module that imports Wails. It re-exports `bun.*`, `onBunMessage` and `notifyBun` with today's signatures, and wraps each generated call in a `settle()` that resolves `{ok: true, …}` or maps `RuntimeError` to `RpcFailure` (`error: e.message`, `status: e.cause?.status`, `retryAfterSec: e.cause?.retryAfterSec`). Then none of the call sites in §4 change, and `mutate.ts` and the `Retry-After` handling (`SessionService.ts:168-172`) keep working.

**Pushed messages.** Tagged unions (`rpcSchema.ts:145-157,167-170,189-205`) become one registered event per variant (`binaries:progress`, `binaries:installed`, `binaries:finished`, `binaries:failed`, `import:progress`, `import:staged`, `import:failed`, `session:expired`, `presence:status`). Each gets an exact generated payload type, which the facade folds back into today's `onBunMessage` shapes.

**Types.** Generated with `wails3 generate bindings -ts -i` (the template's own flags, `port-sandbox/app/build/Taskfile.yml:191`):

| Go | Generated TS | Consequence |
|---|---|---|
| `*string` | `string \| null` | ok |
| `string` + `omitempty` | `?: string` | Use where the frontend checks `!== undefined` (e.g. `PresenceService.ts:102`) |
| `[]int32`, `map[string]int` | `number[] \| null`, `{…} \| null` | A nil slice marshals as `null` (seen at runtime: `"artistIds": null`) |
| `[]byte` | `string \| null` (base64) | ok for covers |
| named string consts | TS `enum` with `$zero` | ok |
| type with `MarshalJSON`/`UnmarshalJSON` | `any` | The tri-state can't be typed by the generator |
| `time.Time` | `string` | none used |

Recommendation:
- **Types:** keep the data types of `src/shared/rpcSchema.ts` as hand-written frontend types in `frontend/src/api/types.ts` (19 components and 2 `lib/` modules import them, e.g. `ArtistsView.tsx:24`, `lib/storage.ts:2`). The facade casts the generated results to them.
- **Nil slices:** Go always builds slices non-nil. A Go test marshals every response type and fails on a JSON `null` array.
- **Absent vs null** ("a null image removes it, an absent one leaves it", `contract.ts:44`): `Nullable[T]{Set, Null bool; V T}` with `UnmarshalJSON` + `MarshalJSON` + `IsZero`, tagged `omitzero`, works across the binding unchanged. In the running app, JS `{}`, `{coverBase64: null}` and `{coverBase64: "QUJD"}` arrived as absent, null and set, and were re-marshalled as `{"id":"a"}`, `{"id":"a","coverBase64":null}` and `{…,"coverBase64":"QUJD"}`. The facade's hand-written param types (`coverBase64?: string | null`, `rpcSchema.ts:70`) stay as they are.

### 3.4 Concurrency: one model per piece of shared state — **med**

Each bound call is a goroutine, so every piece of state Bun's event loop protected gets the simplest model that fits. Evidence is in `port-sandbox/gotests/<pkg>`, all run with `go test -race`.

| State (today) | Model | Why this model | Evidence |
|---|---|---|---|
| Session + proxy check (`ApiClient.ts:95-151`) | Immutable `Session` value behind `atomic.Pointer`. `SetProxy` probes, then `CompareAndSwap(old, next)`, else "session changed". `Expire(seen)` is a CAS too | Readers on every request; writers rare and whole-value. No lock to hold across the network probe | `session_test.go`: 500 rounds of concurrent login/logout/SetProxy/expire/read; `TestExpireIgnoresNewerSession` |
| Busy flags + quit guard (`index.ts:77-123`): `importer.isActive`, `mediaSearch.isActive`, `binaryManager.isBusy`, `appUpdater.isBusy`, `trackTransfers` | `busy.Registry`: one mutex, `Acquire(kind) (release, error)` checks the conflict table and takes the token atomically. `QuitBlocker()` reads the same counters | Check-and-act must be one step: 97/2 000 overlaps with the 1:1 port, 0 with `Acquire` | `busy_test.go` |
| Importer queue (`UrlImporter.ts:47-50,94-115`) | One worker goroutine reading a buffered channel; `Start` takes a `busy.Import` token per job, released when the job ends | Serial by construction, so no `running` flag and no lock; the token is "running or queued" | `importer_test.go`: order kept, install refused while queued, import refused while installing |
| Search supersede (`MediaSearch.ts:48-49,67-69,107`) | Mutex-held `context.CancelCauseFunc`; a new search cancels the old one with `ErrSuperseded`. The call's own ctx is the parent, so `promise.cancel()` also stops it | The cause tells superseded apart from caller-cancelled; no generation counter | `search_test.go` (against a fake `yt-dlp.exe`, so 30 searches rather than 200): newest wins, caller cancel ≠ superseded, a storm leaves nothing behind |
| Binary install task (`BinaryManager.ts:52,141-145`) | `busy.Install` token; a second `Install` while one runs returns ok (joins), as today | Nothing else in the process to share; progress goes out as events | covered by `busy_test.go` |
| `VexWaveData\bin\` across channels (today both channels already share `%LOCALAPPDATA%\VexWave\bin`, `BinaryManager.ts:30-35`, with no cross-process guard) | `LockFileEx` on `bin\.lock`: shared around every managed-binary spawn, exclusive around installs; taken in addition to the `busy` token | `busy.Registry` only sees its own process, and two channels (a dev build and stable, later canary) can run at once. Windows refuses to replace or delete a running exe | `port-sandbox/gotests/datadirs/binlock_test.go` (§3.13) |
| App update state (`AppUpdater.ts:22-24`) | The Wails updater owns its state (`sync.RWMutex`, `wails:v3/pkg/updater/updater.go:197-201`); `UpdateService` holds `busy.AppDownload` around `DownloadAndInstall` | No state of our own left | `updatertest` |
| Discord presence (`DiscordPresence.ts:60-280`, three nullable timers) | One actor goroutine owns the socket, state and timers. Callers send on channels; `SetEnabled` carries a reply channel ("the switch is a request", root `CLAUDE.md`). A reader goroutine forwards frames tagged with their socket, so stale frames are ignored | Timer callbacks and socket events mutate the same fields; an actor removes `clearTimer` and the reentrancy reasoning | `presence_test.go`: 101 changes from 20 goroutines → 3 sends ≥ 5 s floor apart (scaled), last track wins; concurrent toggles |
| Stream downloads + cache (§3.1) | `downloads` map under the server mutex; each `download` has its own mutex plus a close-and-replace `changed` channel; the cache is a mutex LRU | Readers must wait on progress *and* their request ctx; a channel can be `select`ed, a `sync.Cond` can't | `media` tests |
| Upload staging + queue (§3.2) | Mutex-guarded map of staged entries (bound calls and the cover route); each `Confirm` waits on the previous one's done channel | Short critical sections, two goroutine sources; a chain of channels keeps confirm order without a worker | `upload_test.go` (`TestConfirmQueue`) |
| Proxy setting (`ApiClient.proxyUrl`) | The proxy is part of the immutable `Session`. `netx.For(proxy)` hands out that proxy's API and stream clients, rebuilt only when the proxy changes (mutex), since transports pool connections per proxy; yt-dlp env and updater read the session's proxy | Read on every request, written on login/settings | covered by `session` pattern |

Two more findings:
- **Latent bug in today's code:** `StreamProxy`'s 401 callback calls `api.expireSession()` unconditionally (`index.ts:36-45` → `ApiClient.ts:101-103`). A late 401 from a stream that started under the old token can log out a session created after it. `Expire(seen)` with CAS fixes it.
- **Quitting:** `process.exit` after 500 ms (`index.ts:121`) becomes `time.AfterFunc(500*time.Millisecond, app.Quit)`, so the reply leaves first.

### 3.5 Search ranking — **med**

`src/bun/searchRanking.ts` ported to `port-sandbox/gotests/ranking/rank.go` (301 lines). `rank_test.go` runs the same pages through the app's own `rankHits` (via bun, `port-sandbox/ranking/rank-ts.ts`) and the Go port, and compares order and every score (to 1e-9).

**Data:**
- 20 real pages captured with the app's exact yt-dlp arguments: 16 YouTube, 4 SoundCloud, 480 hits (`port-sandbox/ranking/capture.ts` → `pages.json`).
- 11 synthetic pages aimed at each divergence (`port-sandbox/ranking/synthetic.ts`).

**Port choices:**
- **Lookbehind** (`:19`, unsupported by RE2): `\b(?:dj[ -]?set|mega ?mix|mixtape)\b`, or any `\bmix\b` whose preceding text doesn't end in `\b(?:original|…|festival)\s`. Checked on "Mix", "Original Mix", "Club  Mix" (two spaces stays penalised, as in JS), "Radio-Mix", "unoriginal mix", "VIP\tMix", "Megamix" and "remix". All identical to JS.
- **`\b` stays ASCII** in both engines ("Ölive", "Café live" behave identically).
- **Normalisation:** `norm.NFD` + `runes.Remove(runes.In(unicode.M))`. That is all marks like `\p{M}`, not just `Mn`: Devanagari vowel signs are `Mc`. The Hindi page is identical.
- **Tokens are `[]rune`**, and the stable sort is `slices.SortStableFunc`. Stability matters: 3 exact score ties occurred among 522 hits, because the index prior can exactly offset an affinity point.

**Results:**
- **All 20 real pages identical** in order and scores.
- Where the outputs differ, Go is better:

| Case | JS behaviour | Go behaviour | Better |
|---|---|---|---|
| Greek final sigma: query `λογος`, title `ΛΟΓΟΣ` | `toLowerCase` gives final `ς`, exact match | `strings.ToLower` gives `σ`, only a fuzzy match (−3.2) | **Go with `cases.Fold()`**: σ/ς/Σ all fold to `σ`. Matches JS on both Greek pages and also handles `λογοσ`, which JS misses |
| Turkish `İNTERVIEW istanbul` | `toLowerCase` gives `i̇nterview`, so `\binterview\b` misses and there is no penalty | Lowercases to `interview`, penalty applied | **Go**: the title is an interview |
| 3 astral letters `𝓑𝓮𝔂` vs `𝓑𝓮𝔁` | Length counts 6 UTF-16 units, edit budget 1 → 0.8 match | 3 runes → budget 0 → no match | **Go**: the design intent is "≤ 3 letters, no fuzz" |

**Recommendation:** tokenize with `golang.org/x/text/cases.Fold()` (`TestFoldVariant`: 29/31 pages identical, the two remaining differences being the improvements above). Keep `strings.ToLower` for the regex input. Ship `rank_test.go` with `pages.json` as the regression suite, since weights are only tuned against real pages (`src/bun/CLAUDE.md` "Discover search"). The branch has no TS ranker, so there the test compares against a golden `testdata/ranked.json` (order and scores). It is written once from the Go port, after the TS comparison above passes in the reference checkout.

### 3.6 yt-dlp process plumbing, imports, search — **med**

`ytDlp.ts` forces `--encoding UTF-8` (`:3-6`), prepends the bin dir to whichever casing of `PATH` exists and swaps proxy variables (`:8-28`), reads lines (`:82-97`), and extracts the last `ERROR:` line (`:69-80`).

- **Console windows:** a GUI-subsystem Go binary (built `-H windowsgui`, like every Wails build) that starts a console program gives the child a visible console window. With `SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}` it gets none (`port-sandbox/gotests/winproc/winproc_test.go`: `console=true visible=true` vs `console=false`). Every spawn goes through one `platform.Command()` helper.
- **PATH:** Go's `exec` de-duplicates `Env` case-insensitively on Windows and keeps the last entry. Appending `PATH=<bin>;<old>` wins over an inherited `Path=` (`winproc/env_test.go`). The find-the-key-casing logic (`ytDlp.ts:15-18`) isn't needed.
- **Killing:** `yt-dlp.exe` is a PyInstaller one-file build. It runs a second `yt-dlp.exe` as its worker (seen with `Win32_Process`). Killing the parent through `exec.CommandContext` cancellation ended the worker within 1.5 s (`winproc/ytdlp_test.go`, `TestYtDlpKillLeavesChildren`). So no job-object wrapper is needed. Whether an ffmpeg started by the worker during an import also ends is still to check (§7).
- **Bin lock:** every yt-dlp run holds the shared bin lock for its whole lifetime, so the ffmpeg it starts is covered too (§3.13).
- **Proxy env for children:** same logic as `ytDlp.ts:19-27` (yt-dlp reads `no_proxy` itself).
- **Imports:** the worker goroutine from §3.4, writing to `VexWaveData\<channel>\imports\`. The finished file goes to `Uploads.Stage` (§3.2) as an owned file, deleted once it's uploaded or discarded. A failed job deletes its own `<id>.*` files. So `discardImport` has no caller left and is gone. A job the user dismissed before its `import:staged` arrives gets its staged entry discarded by the webview. The avatar lookup (`UrlImporter.ts:189-225`) runs as a goroutine joined before staging.
- **Search:** §3.4. `DiscoverService` doesn't `cancel()` the previous promise; it ignores stale answers by generation, as today.
- **Tests** run the real spawn path against a fake `yt-dlp.exe` that `internal/ytdlp/ytdlptest` builds into the test's temp dir.

### 3.7 Discord Rich Presence — **med**

Actor design and evidence in §3.4.
- **Transport:** `github.com/Microsoft/go-winio`'s `DialPipeContext`. The standard library doesn't work for this, which the sandbox missed because it never wrote while a read was pending, and the actor always does (its reader goroutine waits on the pipe between Discord's frames):
  - `os.OpenFile` opens a synchronous handle, and a `Write` waits behind the pending `Read` until Discord sends something, so SET_ACTIVITY stalls.
  - `windows.CreateFile(…, FILE_FLAG_OVERLAPPED)` + `os.NewFile` lets the write through, but Go's poller updates the file offset from `Read` and `Write` without a shared lock on a pipe (`internal/poll/fd_windows.go`, `addOffset`), so `go test -race` fails inside the standard library.

  `Close` from the actor releases the blocked `Read`, which disable and quit need. A missing pipe fails at once. A busy pipe counts as absent after 500 ms, and the sweep moves to the next index or the 10 s retry.
- **Status ordering:** a `presence:status` event can reach the webview before the reply to an earlier `SetEnabled` call, which Electrobun's RPC never did. The fake Discord answers within a millisecond, so in the app the stale "offline" reply overwrote "connected". The actor numbers every status it hands out (`seq`), and the facade keeps the newest.
- **Framing and helpers:** `binary.LittleEndian` frames written in one `Write`, `os.Getpid()`, `net/netip` for the routability check (`DiscordPresence.ts:384-415`), and rune-based `clampText` (`:417-422`).
- **Live Discord** (handshake, nonce replies, activity refusal) is still to check (§7). The tests run a fake Discord on a real named pipe (`winio.ListenPipe`, at index 3 so the sweep is exercised), and the app was checked end to end against one on `discord-ipc-0`: Settings shows Connected, playing sends SET_ACTIVITY, and switching it off closes the pipe.

### 3.8 WebView2 profile and saved login — **low**

The login stays in `localStorage` (`storage.ts:75-79`) and is pushed to Go with `restoreSession` (`SessionService.ts:23-55`), as today.

- **Persistence:** verified with `port-sandbox/cdp/probe-persist.ts`. A value written to `localStorage` survived a graceful quit (`app.Quit`), a hard `TerminateProcess` 200 ms after the write, and one 3 s after it, each read back after a fresh launch. The same holds with a custom `WebviewUserDataPath`.
- **Default profile:** `%APPDATA%\<exe name>\EBWebView` (`wails:v3/internal/webview2/pkg/edge/chromium.go:241-249`; `wails:v3/pkg/application/application_options.go:296-298`). Observed: `--user-data-dir="…\AppData\Roaming\probe.exe\EBWebView"`. That is keyed on the **exe name** and lives in **Roaming**.
- **Setting:** `Windows.WebviewUserDataPath` = `%LOCALAPPDATA%\VexWaveData\<channel>\webview` (Ground rules 6):
  - dev, canary and stable keep separate logins, as Electrobun channels do today;
  - renaming the exe doesn't log users out;
  - a roaming domain profile doesn't carry the WebView2 cache;
  - uninstalling a channel removes its login with `VexWaveData\<channel>\` (§3.11).
- **`wails3 dev` has its own login:** it loads the page from `http://wails.localhost:<vite port>` (9245, `Taskfile.yml`), not `http://wails.localhost` (`wails:v3/internal/assetserver/assetserver.go:167-194`). `localStorage` is per origin, so the same `dev` profile holds one login for `wails3 dev` and another for a built dev exe.
- **Remote debugging:** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` has no effect on a Wails app. Wails always passes `--disable-features=msSmartScreenProtection` through the API (`wails:v3/pkg/application/webview_window_windows.go:2586-2605`), and the debugging port never appeared on the browser command line. Use `Windows.AdditionalBrowserArgs: []string{"--remote-debugging-port=N"}` behind a dev flag: the `VEXWAVE_CDP_PORT` environment variable, honoured only by `dev` builds. Port 9222 is held by a system service on this machine, so pick another.

### 3.9 App updater — **med**

**Current code.**
- `check()` reads the channel (`AppUpdater.ts:38-39`) and GitHub's latest release, then picks the asset named `VexWave-Setup.exe` (`appRelease.ts:4,43-63`).
- `startDownload()` streams the download with SHA-256 and a size check (`download.ts:16-61`).
- `install()` hands over to a PowerShell worker that waits, kills leftovers, runs the installer hidden and relaunches `launcher.exe` (`AppUpdater.ts:145-194`, `detachedHelper.ts:40-153`).

**Wails updater**, tested with the real v3.1.0 package against a fake GitHub API (`port-sandbox/gotests/updatertest/updater_test.go`):
- **Setup:** `app.Updater.Init(updater.Config{CurrentVersion, Providers: [github.New(github.Config{Repository, ChecksumAsset: "SHA256SUMS", HTTPClient})], Window: updater.WindowNone})`. `github.New` returns `(*Provider, error)`.
- **Asset choice:** the default matcher picked `VexWave-windows-amd64.exe` from among a `SHA256SUMS` and a `VexWave-Setup.exe`.
- **Install without a key:** `Check` → `DownloadAndInstall` reached `StateReady` with byte-identical staged bytes. All 3 requests went through the injected `HTTPClient`, which is where the user's proxy goes.
- **Tampering:** a tampered checksum gives `updater: digest mismatch`.
- **Staging location:** `wails-update-*` beside the running binary (seen next to the test binary). So the install dir must be user-writable, which means a per-user NSIS install (§3.10).
- **Swap:** `Restart` re-execs the binary in helper mode, waits for the parent (30 s, `HelperReadyTimeout`), renames the old exe aside, moves the new one in and relaunches, rolling back if the launch fails (`wails:docs/mpress/content/guides/updater.md:589-601`). Its helper spawn already handles a kill-on-close job: it adds `CREATE_BREAKAWAY_FROM_JOB` and drops it if breakaway is denied (`wails:v3/pkg/updater/spawn_windows.go:17-51`). Checked end to end with an installed 0.6.1 and a fake GitHub serving 0.6.2 (debug port and API URL patched in for the test build only): the banner offered 0.6.2, the download went through the injected client, "Restart to install" swapped the exe and relaunched 0.6.2 from the same folder within a second, with the app inside the harness's kill-on-close job.
- **A corrupt release:** a payload with a valid `MZ` header and a matching checksum passes download and verify, so the banner reaches "ready". The helper then swaps it in, fails to launch it, restores the backup and relaunches the old version. The user is never left without a working exe.
- **Leftovers:** Wails clears a staged `wails-update-*` folder only on the next download in the same run, and leaves the replaced exe renamed to `VexWave.exe.old.<n>` because Windows won't delete it while it's still mapped (`wails:v3/pkg/updater/helper_windows.go:120-176`). `UpdateService` sweeps both beside the exe at startup; `SingleInstance` has already exited a second launch by then (`TestSweepLeftovers`, and checked in the installed app).

**Channels.** Same rules as today:
- **Stable:** checks GitHub's latest release, downloads and installs.
- **Dev:** checks and downloads, but can't install, because it isn't an installed copy (`AppUpdater.ts:39,83`). `UpdateService.Restart()` uses the same installed-copy check as `Removable()` (§3.11).
- **Canary:** never self-updates. A canary build doesn't set up `app.Updater` at all, and `Check` answers "no update" as `AppUpdater.ts:39` does today, so the banner never shows. Canary isn't packaged for now (§5). Today it never reaches the releases page (`build-windows.yml:101-104`), so it can't take stable's release feed.

**What changes.**
- **Releases** publish the bare app exe plus `SHA256SUMS`, next to the NSIS installer for first installs. The GitHub provider reads only `ChecksumAsset`, not GitHub's per-asset `digest` (`wails:v3/pkg/updater/providers/github/github.go:167-178`).
- **Frontend:** keeps `AppUpdateBanner` and `AppUpdateService` with its own phases. The facade maps three of the updater's events onto `appUpdateProgress`: `wails:updater:download-progress` (`written`/`total`), `update-ready`, and `error` except at the `check` stage, since a failed check means no banner. A failed download shows the updater's own message (for example `updater: digest mismatch`).
- **`internal/update`** wraps `app.Updater` (`update_test.go` runs it against a fake GitHub):
  - `Configure` sets up the GitHub provider; its `HTTPClient` sends each request through `netx.For(proxy)`'s stream transport, so a proxy change applies to the next request and a release asset keeps its `Content-Length`.
  - `Check` reports the newer version; any failure reads as no update, as `AppUpdater.ts:38-49` does.
  - `Download` refuses with "There is no update to download." before a successful `Check` and "The update is already downloading." during one. It runs `DownloadAndInstall` in the background under a `busy.AppDownload` token.
  - `Install` checks `busy.QuitBlocker()` first, as `thenQuit` does today, then that the staged file still exists (`downloadMissing` in the error's JSON otherwise), then the installed-copy check (`uninstall.InstallDir`), then calls `Restart`.
- **Deleted:** `AppUpdater.ts`, `download.ts` (`BinaryManager` keeps a small download helper), `appRelease.ts`, the PowerShell worker and the WinForms window.
- **No signing for now:** §5.

### 3.10 Packaging, window chrome, HiDPI — **med** (all of it gets smaller)

What it replaces:
- `scripts/fuse-installer.ts`;
- `scripts/stamp-win-icons.ts`;
- `WindowChrome.ts`;
- the resize nudge (`index.ts:204-222`);
- `bundleCEF: true` and its location prompt (`electrobun.config.ts:23-26`);
- the ~500 MB CEF cache in CI (`build-windows.yml:45-53`).

Wails equivalents (src):
- **Installer:** `wails3 package` builds NSIS. `!define WAILS_INSTALL_SCOPE "user"` installs to `$LOCALAPPDATA\Programs\<Product>` (`wails:v3/internal/commands/build_assets/windows/nsis/project.nsi.tmpl:32,76-77`). It writes `UninstallString` and `QuietUninstallString` (`…\uninstall.exe" /S`) under `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<UNINST_KEY_NAME>`, which defaults to `<Company><Product>` (`wails:v3/internal/commands/updatable_build_assets/windows/nsis/wails_tools.nsh.tmpl:25-28,127-136`). Built with NSIS 3.13 and run: the silent install created `Programs\VexWave` (only the exe and `uninstall.exe`), the `VexWave` key with both uninstall strings, and both shortcuts.
- **Stable only for now:** `wails3 task package EXTRA_TAGS=stable` builds the stable installer, installing to `Programs\VexWave`. `project.nsi` sets `WAILS_INSTALL_SCOPE "user"` itself, so a plain `wails3 task package` builds the per-user installer, and sets `UNINST_KEY_NAME` explicitly (`VexWave`, Port setup → Names) (`wails_tools.nsh` only defines it when it's unset): §3.11 checks this exact name, and `buildinfo` holds it. The name must not be the Electrobun key `<identifier>` (`app.vexwave`, `electrobun.config.ts:6`), because the old uninstaller deletes that key (`Uninstaller.ts:75`). A separate canary product is deferred (§5).
- **Install folder:** holds only the app, `uninstall.exe` and the updater's transient `wails-update-*` staging (§3.9). User data goes to `VexWaveData` (Ground rules 6).
- **Dark caption:** `WindowsWindow{Theme: application.Dark, CustomTheme: ThemeSettings{…}}` (`wails:v3/pkg/application/webview_window_options.go:366-372,439-450`). The colours in `WindowChrome.ts:22-24` carry over, the same for active and inactive, as the DWM attributes were. Checked with Windows in dark mode: the caption pixel reads `#1c1c1c`. The icon needs nothing at runtime, since Wails embeds it in the exe.
- **DPI:** the manifest declares `permonitorv2,permonitor` (`wails:v3/internal/commands/updatable_build_assets/windows/wails.exe.manifest.tmpl:11-12`). Measured: at 125 % scaling the page reports `devicePixelRatio` 1.25, and WebView2 starts with `--embedded-browser-webview-dpi-awareness=2`. No nudge is needed. `lib/devicePixelRatio.ts` keeps its media query; its `resize` trigger was for CEF and is gone.
- **Build:** `wails3 build` with `PACKAGE_MANAGER=bun` worked end to end in the sandbox. The frontend build is `tsc && vite build`; bindings come from `wails3 generate bindings -clean=true -ts -i` (`port-sandbox/app/build/Taskfile.yml:191`).
- **Release flow:**
  - `scripts/set-version.ts` writes the version into `build/config.yml` and `build/windows/info.json`. `release.ts` calls it for the bump commit, and CI calls it with the tag. Regenerating `info.json` with `wails3 update build-assets` isn't an option: it recreates the deleted macOS, iOS and Linux folders and resets `info.json`'s `Comments`.
  - **No ldflags:** the generated `BUILD_FLAGS` would need editing for `-X`. Instead the channel is a build tag passed through the Taskfile's `EXTRA_TAGS` (`wails3 task package EXTRA_TAGS=stable` builds `-tags=production,stable`; no tag means `dev`). `buildinfo.Version` reads the exe's own version resource, which `generate:syso` builds from `info.json`. So the version the updater compares is the one Windows shows, and `go run`/`go test` read `0.0.0`.
  - `build-windows.yml` builds and packages stable on a `v*` tag and publishes the assets above; a manual run builds the same without publishing. Canary packaging is deferred (§5). NSIS is installed by the workflow if the runner lacks it.
- **Build assets:** only `build/windows/` is needed. With the other platforms' folders deleted, the `generate:icons` task must drop its macOS outputs (`-macfilename ""`); `wails3 build` then works (`port-sandbox/app/build/Taskfile.yml`, `generate:icons`).

### 3.11 Uninstaller — **med**

**Current code:**
- `canUninstall` proves the running exe sits inside `%LOCALAPPDATA%\<identifier>\<channel>` (`detachedHelper.ts:27-38`).
- The PowerShell worker kills, removes, deletes `.lnk` files and the bin dir's parent, and removes the Uninstall key (`Uninstaller.ts:41,59-94`).

**Data layout** (Ground rules 6; paths built in one place, `port-sandbox/gotests/datadirs/datadirs.go` `Layout`):

| Path | Owner | Removed when |
|---|---|---|
| `%LOCALAPPDATA%\Programs\<Product>\` | NSIS, one per installed channel | that channel is uninstalled (`RMDir /r $INSTDIR`) |
| `%LOCALAPPDATA%\VexWaveData\<channel>\` (`webview\`, `imports\`) | the app, one per channel (`dev` too) | that channel is uninstalled |
| `%LOCALAPPDATA%\VexWaveData\bin\` and the root | the app, shared by all channels | the last installed channel is uninstalled |

**Uninstall rule.** Uninstalling channel C removes `VexWaveData\C\`. It then removes `bin\` and the whole `VexWaveData` root only if no other channel is still installed. "Installed" means the channel's HKCU Uninstall key (its exact `UNINST_KEY_NAME`, §3.10) exists and carries an `UninstallString`. If reading the registry fails, shared data is kept. Dev builds are never installed, so `VexWaveData\dev\` never keeps the root alive; it goes with the root.

Evidence (`port-sandbox/gotests/datadirs/datadirs_test.go`, with real HKCU keys under a throwaway path that is removed afterwards):
- `TestUninstallRule`: with stable and canary installed, uninstalling canary removed only `canary\`, and `bin\` and `stable\` stayed. Uninstalling stable as the last channel then removed the root.
- `TestInstalledReadsHKCU`: a key without `UninstallString` counts as not installed, and the real `…\CurrentVersion\Uninstall` path reads without elevation.
- `TestUninstallKeepsSharedWhenUnsure`: a registry error keeps `bin\`.
- `TestUninstallToleratesMissingFolders`.

**Where the rule runs: inside the NSIS uninstaller**, so the in-app button and Settings → Apps behave the same.
- The uninstall section (`project.nsi`, from `wails:v3/internal/commands/build_assets/windows/nsis/project.nsi.tmpl:105-119`) runs `ExecWait '"$INSTDIR\${PRODUCT_EXECUTABLE}" --remove-data'` before `RMDir /r $INSTDIR`.
- `--remove-data` is dispatched in `main.go` before `application.New`, so `SingleInstance` never sees it. It takes its channel and the other channels' key names from `buildinfo`.
- The template's `RMDir /r "$AppData\${PRODUCT_EXECUTABLE}"` (`:108`) targets the default WebView2 profile, which the app no longer uses (§3.8). That line is deleted.
- The rule lives in Go rather than NSIS script so that it is tested. The installer run confirmed the NSIS side: both uninstall paths below removed `VexWaveData`.

**In-app uninstall:**
- **`Removable()`:** reads `UninstallString` from this channel's HKCU key (`golang.org/x/sys/windows/registry`) and checks the running exe is inside that directory. Dev builds fail the check, as today.
- **`Start()`:** copies the exe to `%TEMP%` and launches it in an uninstall helper mode (`--uninstall-helper <pid> <installdir>`, dispatched before `application.New`). The helper waits for the PID, then runs `uninstall.exe /S`, which removes the data through `--remove-data`. Shortcuts are the NSIS uninstaller's job. The helper copy stays in `%TEMP%`: a running exe can't delete itself, and a per-user process can't schedule a delete for the next reboot.
- **Tests** (`internal/uninstall/uninstall_test.go`): `InstallDir` against a throwaway HKCU key; the helper waits for a live PID before running a fake `uninstall.exe /S`; a detached spawn runs.
- **Job objects, measured** (`port-sandbox/app/probe.go` `jobInfo`):
  - launched from Explorer (a `.lnk` opened through `explorer.exe`), the app **is in a job**, without kill-on-close and with breakaway allowed;
  - launched by a parent with a kill-on-close job (the test harness), it is in a kill-on-close job.

  So spawn the helper like Wails' updater does: `DETACHED_PROCESS | CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB`, retrying without breakaway if it's denied (`wails:v3/pkg/updater/spawn_windows.go:17-51`). No PowerShell, no WMI, no quoting helpers (`detachedHelper.ts:125-144`).
- **Checked with the installed app:** the in-app button (with the app in the harness's kill-on-close job) and `QuietUninstallString` (what Settings → Apps runs, silently) each removed the install folder, the key, both shortcuts and `VexWaveData`, and no `%APPDATA%\VexWave.exe` profile appeared.

### 3.12 Track download to disk — **low**

`TrackDownloader.ts:17-20` shares one 120 s RPC between the picker and the copy. In Go:
- **Picker:** `app.Dialog.OpenFile().CanChooseFiles(false).CanChooseDirectories(true).SetDirectory(start).PromptForSingleSelection()` (`dialogs.go:234-239,287,350`), with no timeout.
- **Bytes:** from the cache, or a `progressive` reader on the shared download (§3.1), instead of an HTTP self-request (`:31`). Copied with `io.Copy` rather than `arrayBuffer()` (`:39`), holding a `busy.Transfer` token from when the folder is chosen (today it is held while the dialog is open too).
- **File naming:** `freeName`'s exists-then-write race (`:74-85`) becomes `os.OpenFile(…, O_CREATE|O_EXCL)`. `fitName`'s 250-unit budget (`:57-72`) is UTF-16, so measure it with `utf16.RuneLen`.

### 3.13 Managed binaries — **med**

A direct port, except for where the binaries live.
- **Location:** `%LOCALAPPDATA%\VexWaveData\bin\`, shared by all channels (today `%LOCALAPPDATA%\VexWave\bin`, `BinaryManager.ts:30-35`). Moving it costs one re-download of yt-dlp, ffmpeg/ffprobe and deno (§5). The shared `manifest.json` (`:311`) moves with it.
- **Unzip** with `archive/zip` instead of `System32\tar` (`:263-277`).
- **Replacing files:** `os.Rename` replaces an existing file on Windows (`winproc_test.go`, `TestRenameReplaces`), so `rm` before rename (`:281-283`, `:325`) goes. A **running** exe can be neither replaced nor deleted: both failed with "Access is denied" (`datadirs/binlock_test.go`, `TestRunningExeCannotBeReplaced`).
- **Cross-process lock:** `busy.Install` only excludes the app's own spawns, but two channels (a dev build and stable, later canary) can run at once on the same `bin\`. So `LockBin` (`port-sandbox/gotests/datadirs/binlock.go`) takes `LockFileEx` on `bin\.lock`:
  - every spawn of a managed binary (yt-dlp search or import, ffprobe/ffmpeg in `Stage`) holds it **shared** while the process runs;
  - installs and the yt-dlp update hold it **exclusive**;
  - the startup install waits for the lock;
  - a user action fails fast with `ErrBinBusy` ("another VexWave window is using or updating the tools").

  The lock is taken in addition to the `busy` token. `TestBinLockAcrossProcesses`, with a second process holding the lock:
  - an install is refused during the other process's run, and a concurrent run is allowed;
  - a waiting install proceeds once the other process lets go;
  - a run is refused during the other process's install;
  - a killed holder leaves no lock behind.
- **Progress** becomes the per-variant events.

### 3.14 Backend client and limits — **med**

- **Client:** hand-written `backend.Client` with a `Do(ctx, method, path, body, out)` core and 13 thin methods. Path builders mirror `trackAudioPath`/`*ImagePath` (`contract.ts:397-416`), and edit requests use `Nullable[T]` + `omitzero` (§3.3).
- **Why not generate it:** `@ts-rest/open-api` peers `zod ^3` in every published version, up to `3.53.0-rc.1`. This repo is on zod 4 and `@ts-rest/core 3.53.0-rc.1` (`package.json:31,40`), checked on the npm registry.
- **Errors:**
  - certificate failures classified with `errors.As` (§2);
  - a proxy 407 on an HTTPS target surfaces as a transport error whose text is only `Proxy Authentication Required` (`TestProxy407`). Return a typed error from `Transport.OnProxyConnectResponse` instead (`TestProxy407Typed`);
  - an HTTP target still gets a plain 407 response;
  - `Retry-After` also accepts the HTTP-date form via `http.ParseTime` (`TestRetryAfterDate`); today only seconds are read (`ApiClient.ts:464-467`).
- **Limits:** only `MAX_IMAGE_BASE64` and `MAX_AUDIO_BASE64` are exported (`contract.ts:18-19`); the rest live inside schemas. `z.toJSONSchema` (built into zod 4) gave all eight values: `maxLength`, `maximum` and `maxItems` (`port-sandbox/limits/gen.ts`). `contract/gen-limits.ts` (bun) writes `internal/backend/limits_gen.go` and `frontend/src/lib/limits.gen.ts`, and CI fails when either drifts. That replaces the startup `throw` (`ApiClient.ts:39-46`) and the hand mirror in `src/shared/limits.ts`. The frontend still needs the values for its image pre-checks.

---

## 4. Frontend impact

The UI is copied from `src/mainview/` to `frontend/src/` (Port setup). Paths below are relative to those folders, and line numbers are `main`'s.

**`api/rpc.ts` is the only file that imports Wails.** It re-exports `bun`, `onBunMessage` and `notifyBun` with today's signatures, built on the generated bindings, `Events.On` and `settle()` (§3.3).

### RPC call sites (unchanged behind the facade)

| Service | Calls (`file:line`) |
|---|---|
| `SessionService` | `restoreSession` :42, `login` :77, `setProxy` :116, `logout` :142 |
| `LibraryData` | `getLibrary` :54 |
| `LibraryService` | `deleteTrack` :144, `editTrack` :160 |
| `ArtistService` | `createArtist` :95, `editArtist` :125, `deleteArtist` :152 |
| `PlaylistService` | `createPlaylist` :133, `editPlaylist` :142, `deletePlaylist` :241 |
| `DownloadService` | `downloadTrack` :30-36 |
| `DiscoverService` | `searchMedia` :45 (may `cancel()` the previous promise) |
| `BinaryService` | `getBinaryStatus` :64, `installMissingBinaries` :99, `updateYtDlp` :120, `checkYtDlpUpdate` :134 |
| `PresenceService` | `setPresenceEnabled` :55; `notifyBun.presenceChanged` :70 → `Presence.SetNowPlaying`, not awaited |
| `UninstallService` | `canUninstall` :29, `uninstallApp` :42 |
| `AppUpdateService` | `checkAppUpdate` :43, `downloadAppUpdate` :58, `installAppUpdate` :77 → *changes* |
| `ImportService` | `importFromUrl` :108 (`discardImport` :160 goes with `stage()`) |
| `UploadService` | `uploadTrack` :216 → *changes* |

### Pushed-message listeners → events

| Listener | Becomes |
|---|---|
| `SessionService.ts:176` `sessionExpired` | `session:expired` |
| `BinaryService.ts:225` `binaryProgress` | four `binaries:*` events; the facade can fold them back into today's message |
| `ImportService.ts:187` `urlImportProgress` | `import:progress` / `import:staged` / `import:failed`; the `finished` variant becomes `staged`, carrying the staged file, and its `stage()` (:143-167) goes away |
| `AppUpdateService.ts:125` `appUpdateProgress` | `wails:updater:download-progress`, `update-ready`, `error` |
| `PresenceService.ts:110` `presenceStatus` | `presence:status` |

### Files that change

- **`api/rpc.ts`** (`:1-16`): rewritten as the facade.
- **`api/UploadService.ts`**:
  - staging comes from Go (`Uploads.Pick()`, `import:staged` from imports) instead of `File` objects;
  - `parseBlob` (`:1,109`), the MIME filter (`:93-95`) and the base64 encode of audio (`:219`) go;
  - `confirm` sends `{stagedId, title, artistIds, coverBase64?}`;
  - review state (`staged`, `reviewedCount`) stays in the webview;
  - `music-metadata` (`package.json:36`) isn't added to `frontend/package.json`.
- **`api/ImportService.ts`**: `stage()` and its `fetch(fileUrl)` (`:143-167`) are deleted.
- **`api/AppUpdateService.ts`**: keeps its phases; the upload-queue guard (`:66-73`) is gone, since every queued upload holds `busy.Transfer` and `Install` checks `QuitBlocker`.
- **`components/AddTracksButton.tsx:16-18`**: `<input type="file">` → `Uploads.Pick()`.
- **`components/UploadReviewDialog.tsx:82`**: the staged cover comes from a loopback URL instead of `URL.createObjectURL(coverBlob)`. The replacement-cover picker (`:170-172`) stays a browser `File`.
- **`App.tsx:44-50,67-74,110`**: the drop handlers and the `isDragging` overlay are deleted (§5).
- **`lib/devicePixelRatio.ts:1-5,22`**: the CEF `resize` trigger can go.
- **Types:** the data types of `src/shared/rpcSchema.ts` move to `api/types.ts` as the frontend's hand-written types (§3.3). Its `PlayerRPC` schema (`:260-315`) is replaced by the facade.
- **Imports of `src/shared/`:** the 34 `../../shared/rpcSchema` and 7 `../../shared/limits` imports become `@/api/types` and `@/lib/limits`.
- **Build wiring** (the template's, Port setup):
  - `main.go` embeds `frontend/dist` (`//go:embed all:frontend/dist`, as in `port-sandbox/app/main.go`);
  - bindings are generated into `frontend/bindings`, and only `api/rpc.ts` imports them, by relative path as the template does (`port-sandbox/app/frontend/src/main.tsx:2-3`);
  - `frontend/vite.config.ts` is the template's (Wails Vite plugin `wails("./bindings")`, dev port from `WAILS_VITE_PORT`) plus the `@/` alias to `frontend/src`, which `frontend/tsconfig.json` mirrors. The Vite dev port is the template's, not today's 5173;
  - `frontend/package.json` holds only what the UI uses. `@ts-rest/core` and `zod` live in `contract/package.json` for the limits generator and the test backend.
- **Preview skill:** `harness/__preview-app.html`'s `window.__electrobun = {}` stub (`SKILL.md:87-92`) goes. Importing `@wailsio/runtime` plus generated bindings in a plain browser does not throw: the sandbox frontend rendered in headless Edge with no Wails host (`port-sandbox/cdp/serve-dist.ts`). Calls are never made because the stores are stubbed.
- **Docs:** the four `CLAUDE.md` files don't carry over. The branch has one short root `CLAUDE.md` (Port setup).

---

## 5. Intentionally not ported

**Migration from Electrobun installs, the bridge release, and carrying over settings and login.**
- **Decision:** users reinstall, log in again, and set their settings again.
- **Code affected:**
  - the relaunch logic in `AppUpdater.ts:145-194`, the install roots in `detachedHelper.ts:27-38`, and `scripts/fuse-installer.ts`: not ported;
  - nothing reads `%LOCALAPPDATA%\app.vexwave\<channel>`, `%LOCALAPPDATA%\VexWave` or the CEF profile.
- **Consequences the port must handle:**
  - **Old clients still poll GitHub** for an asset named exactly `VexWave-Setup.exe` (`appRelease.ts:4,48-51`), and run it hidden **without `/S`** (`AppUpdater.ts:159`). Wails releases must not use that asset name: then `pickInstaller` returns `null`, and old clients report "no update" instead of starting an invisible NSIS installer.
  - **The old and new apps don't touch each other's files**, so users can install and uninstall them in any order:
    - the old uninstaller deletes its install tree `%LOCALAPPDATA%\app.vexwave`, the bin dir's parent `%LOCALAPPDATA%\VexWave` (`Uninstaller.ts:41`) and its own Uninstall key `app.vexwave` (`:75`);
    - the port uses none of these (Ground rules 6, §3.10);
    - the old uninstaller deletes a `VexWave.lnk` shortcut only if it points into the old install (`Uninstaller.ts:80-94`), so the NSIS shortcuts of the same name survive.
  - **Cost of the switch:** one re-download of yt-dlp, ffmpeg/ffprobe and deno into `VexWaveData\bin\`, plus the re-login and settings that this decision already accepts.

**Canary packaging and release.**
- **Decision:** deferred. The port packages and releases stable only.
- **What stays in the code**, so canary can be added without redesign:
  - `buildinfo` knows dev, stable and canary, with stable's and canary's `UNINST_KEY_NAME`s (the app never needs a product name: the install folder comes from the Uninstall key). Canary's are fixed now, though nothing packages it yet (see below);
  - `VexWaveData\<channel>\` and the uninstall rule, with their tests (§3.11);
  - a canary build never sets up the updater (§3.9).
- **Consequence:** with no canary installed, uninstalling stable removes `bin\` and the whole `VexWaveData` root.
- **Facts for when it's picked up:**
  - Canary must be a separate product, with its own product name, install folder (`Programs\VexWave Canary`) and `UNINST_KEY_NAME`, so that both channels install side by side as today (`build-windows.yml:61-69`).
  - One `project.nsi` must produce both products. The generated `create:nsis:installer` task passes no channel option to `makensis`: only the install scope and the binary path (`port-sandbox/app/build/windows/Taskfile.yml:128`). So the channel's names need a `-D` define added there, or a separate script.
  - `wails_tools.nsh` sets `UNINST_KEY_NAME` only when it's undefined, so `project.nsi` or a `-D` define can set it per channel.
  - Canary's key name is in `buildinfo` from the start, because every stable build that can share `VexWaveData` with a canary install must check it. Without it, uninstalling stable would take `bin\` and the root from under an installed canary.
  - `build-windows.yml` gets its manual canary run back, publishing a CI artifact rather than a release (`build-windows.yml:101-104`).
  - §7's NSIS check then repeats for both channels side by side.

**Drag & drop of files onto the window.**
- **Decision:** the feature is dropped.
- **Code affected:**
  - `App.tsx:44-50,67-74,110` (drop handlers, `isDragging`, overlay): deleted;
  - `UploadService.enqueue(File)`: replaced by path staging (§3.2).
- **Consequence:** none; the Wails runtime shows a no-drop cursor for OS file drags by default.
- **If reversed:** needs `EnableFileDrop: true` on the window plus `data-file-drop-target` on the target element; otherwise the runtime sets `dropEffect = 'none'` (`wails:v3/internal/runtime/desktop/@wailsio/runtime/src/window.ts:15-16,85-92,719-749`). Paths then arrive in Go via `WindowFilesDropped` and go to `Uploads.Stage`.

**macOS support.**
- **Decision:** not a target.
- **Code affected (not ported):** the macOS branches of `BinaryManager.ts` (`defaultBinDir`, `isSupported`), the Unix socket sweep in `DiscordPresence.ts:354-373`, and every non-Windows path. No per-OS build tags are needed; Windows-only packages may import `golang.org/x/sys/windows` directly.

**Release signing and mandatory updater signatures.**
- **Decision:** deferred; may come later.
- **Code affected:** none today (the Electrobun updater verifies GitHub's digest only).
- **Consequences:**
  - The Wails updater runs **without `PublicKey`**: digest-only via `SHA256SUMS`, verified (§3.9).
  - The exe and installer stay unsigned, so SmartScreen warns on first run (`wails:docs/mpress/content/guides/build/windows.md`, "SmartScreen warning").
- **If reversed:**
  - The GitHub provider never fills in a signature (`github.go:167-178`; `.sig`/`.asc` assets are skipped, `:393-402`). Only the `endpoint` and `appcast` providers carry one (`providers/endpoint/endpoint.go:346-347,407-412`, `providers/appcast/appcast.go:142`).
  - With a key set, digest-only releases are rejected (`TestKeyMakesGitHubDigestOnlyFailClosed`); without a key, any release that carries a signature is rejected (`wails:v3/pkg/updater/config.go:20-36`). Introducing signing therefore needs a stepping-stone release, or a separate feed, for clients built without the key.

---

## 6. Proposed Go structure (sketch)

```
main.go                        // embed frontend/dist, mode dispatch before application.New (--uninstall-helper, --remove-data), window, wiring
internal/
  buildinfo/                   // Channel (build tag), Version (the exe's version resource), the channels' UNINST_KEY_NAMEs
  datadirs/                    // Layout (%LOCALAPPDATA%\VexWaveData\{bin, <channel>\webview, <channel>\imports}), RemoveData rule, LockBin (bin\.lock)
  platform/                    // Command(): CREATE_NO_WINDOW + HideWindow, PATH appended last
  netx/                        // For(proxy): cached API + stream clients; httpproxy ProxyFunc; OnProxyConnectResponse → ProxyAuthError; Unreachable text
  busy/                        // Registry: Acquire(Kind) (release, error), QuitBlocker()
  backend/                     // Client (13 methods), Failure error, Nullable[T], path builders, limits_gen.go
  session/                     // SessionService (bound): Restore, Login, Logout, SetProxy; Store = atomic.Pointer[Session] + CAS
  media/                       // loopback Server; download (shared, progressive reader); Cache (LRU); image + staged-cover routes
  library/                     // LibraryService (bound): GetLibrary, Edit/Delete Track, Artist/Playlist CRUD
  upload/                      // UploadService (bound): Pick, Stage, Confirm, Discard; probe (ffprobe/ffmpeg); streamed body; worker
  download/                    // DownloadService (bound): SaveTrack
  binaries/                    // BinaryService (bound) + Manager
  ytdlp/                       // Command (base args, proxy env), Lines, Tail + Failure (last ERROR: line); ytdlptest builds a fake yt-dlp.exe
  importer/                    // ImportService (bound): Start, Discard; worker goroutine; avatar
  search/                      // SearchService (bound): Search; rank.go (pure, cases.Fold) + rank_test.go + testdata/{pages,ranked}.json
  presence/                    // PresenceService (bound): SetEnabled, SetNowPlaying; actor; pipe via go-winio (§3.7)
  update/                      // UpdateService (bound): app.Updater + GitHub provider (ChecksumAsset, HTTPClient from netx)
  uninstall/                   // UninstallService (bound): Removable, Start; the --uninstall-helper and --remove-data modes; InstallDir, which the updater's installed-copy check shares
  events/                      // RegisterEvent[...] calls + payload structs (the import:* events live in importer: their payload carries upload.Staged, and upload → session → events would be a cycle)
```

Seams:
- **`session.Store.Current()`** hands out the immutable `Session`, and `backend.Client` is built from it plus `netx`'s current `*http.Client`. That replaces the `api.auth`/`api.proxy` getters threaded through constructors (`index.ts:36-73`).
- **`media.Server`:**
  - takes a `Session` interface (route plus `Expire(seen)` for a 401) and `upload`'s staged-cover lookup, through an interface defined in `media` so the packages don't import each other;
  - exposes `TrackURL`, `HeadURL`, `ImageURL`, `StagedCoverURL`, `Evict`, and `Reader(ctx, id)` for `download`.
- **`busy.Registry`** is injected into `importer`, `search`, `binaries`, `upload`, `download`, `update` and `uninstall`, so a new spawner can't be written without it.
- **Spawning managed binaries:** `platform.Command()` is the only spawn path. Whoever runs a binary in `bin\` holds `datadirs.LockBin` shared around the spawns (`upload.Stage` once per call, covering every ffprobe/ffmpeg it runs). `binaries` takes it exclusively.
- **Events:** a one-method `Emitter` interface (implemented by `*application.App`) keeps services testable without a window, as the sandbox tests do.
- **Lifecycles** use `ServiceStartup`/`ServiceShutdown`:
  - `media` starts its listener;
  - `importer` sweeps stale files (`UrlImporter.ts:117-130`) and starts its worker;
  - `presence` stops its actor.

The frontend (`frontend/`), the contract tooling (`contract/`) and the build assets (`build/`) sit beside this tree as Port setup lays out.

**Where each package starts** (Ground rules 7). On the branch, read the sources in the reference checkout. Tests that compare against the old app's TypeScript stay there; their Go side moves with fixed expectations:

| Package | Start from | Tests that move with it |
|---|---|---|
| `datadirs` | `port-sandbox/gotests/datadirs` | `datadirs_test.go`, `binlock_test.go` |
| `busy` | `port-sandbox/gotests/busy` | `busy_test.go` |
| `session` | `port-sandbox/gotests/session` | `session_test.go` |
| `media` | `port-sandbox/gotests/media` (`Event` stays only as the unexported `onEvent` hook the tests read) | `server_test.go`, `fakebackend.go` |
| `netx`, `backend` (errors, `Retry-After`) | `port-sandbox/gotests/netx` | `netx_test.go` |
| `upload` | `port-sandbox/gotests/upload` | `upload_test.go`; `probe_test.go` asserting the ffprobe results directly (the `music-metadata` comparison through `fixtures/mm.ts` stays in the reference); `gen.sh` moves to `internal/upload/testdata/`, and the tests run it with the managed ffmpeg when the git-ignored fixtures are missing. Without a managed ffprobe (as in CI) the probe tests skip |
| `importer` | `port-sandbox/gotests/importer` | `importer_test.go` |
| `search` | `port-sandbox/gotests/search`, `port-sandbox/gotests/ranking` | `search_test.go`; `rank_test.go` against `testdata/pages.json` (the sandbox's `all-pages.json`: 20 real + 11 synthetic pages) and the golden `testdata/ranked.json` (§3.5), written with `go test -update` after the fold variant again matched TS on 29/31 pages, the two differences being the improvements in §3.5 |
| `presence` | `port-sandbox/gotests/presence`, `port-sandbox/gotests/pipe` | `presence_test.go`, with the fake Discord on a real pipe; `pipe_test.go`'s findings are superseded by §3.7's transport bullet |
| `platform` | `port-sandbox/gotests/winproc` | `winproc_test.go`, `env_test.go`, `ytdlp_test.go` |
| `update` | `port-sandbox/gotests/updatertest` | `update_test.go`, through `UpdateService` against the fake GitHub; the sandbox's `PublicKey` case stays there, as no key is configured (§5) |
| `backend.Nullable`, error shape | `port-sandbox/app/probe.go` | the `port-sandbox/cdp/probe-bridge.ts` checks |
| `contract/gen-limits.ts` | `port-sandbox/limits/gen.ts` | CI drift check for both generated files |

---

## 7. Verification still to do

Every claim in this report that is not yet proven is listed here. Other sections only point to this table.

| Item | Why it isn't verified yet | Area / phase | How to test |
|---|---|---|---|
| **Renderer crash with playback + `/head` + Web Audio** (§8) | Seen 3 times with one early probe, never reproduced since. The manual check below was run on the port and didn't reproduce it; it stays a watch item | First phase: the media server and the player | Manual check on a production build (`-tags production`) against the real backend, with the dev-flag CDP port on (§3.8). Turn Drive on in the player bar's effects popover (effects reset every launch, and the `/head` scan only runs while Drive is above 0, `Drive.ts:166-168`). Then start a track that isn't cached yet, so playback, the `/head` decode and the Web Audio graph start together. Skip to the next uncached track, and repeat 10 times on each of 3 tracks. Watch for a blank or reloaded webview, and attach Playwright with `page.on("crash")` as `port-sandbox/cdp/probe-audio.ts` does (run from the reference checkout). Repeat once at 125 % scaling. |
| **Live Discord** | Discord isn't installed on the reference machine | Presence (§3.7) | With Discord running, check the handshake, the card while playing, the nonce reply when activity privacy is off (refused activity), and that the card clears on toggle-off and on quit. Restarting Discord must reconnect within the 10 s sweep. |
| **ffmpeg ends when an import is cancelled** | Only the search case was measured; an import needs a real download | Importer (§3.6) | Start a URL import that reaches the ffmpeg post-processing step, cancel it (or quit), then list `Win32_Process` for `yt-dlp.exe`/`ffmpeg.exe` descendants: none may remain after 2 s. If one does, put the import's process tree in a kill-on-close job. |
| **Dark title bar** | The caption is meant to stay dark whatever the Windows theme (`Theme: application.Dark`); light mode and the inactive window weren't inspected, as this machine runs dark mode | Window setup (§3.10) | Dark mode, active window: done (§3.10). Still to do: screenshot the caption with Windows set to light mode, both active and inactive: it must use the `WindowChrome.ts:22-24` colours. |
| **`wails3 dev` hot reload** | Not run | Build wiring (§4) | Run `wails3 dev` with `PACKAGE_MANAGER=bun`, edit a component and check the window updates without a restart. Edit a Go service and check it rebuilds and the bindings regenerate. |

---

## 8. Open questions

1. **Renderer crash seen once (watch item).** The first version of `port-sandbox/cdp/probe-audio.ts` crashed the WebView2 renderer three runs in a row. It crashed in the step that starts playback, `/head` decoding and a Web Audio graph together. Nine isolated and combined variants (`port-sandbox/cdp/probe-crash.ts`, `probe-crash2.ts`) and the final probe never crashed. A manual try on the port didn't reproduce it either. Whether it can happen in the app is open; the manual check in §7 is how the first phase watches for it.
2. **Search ranking quality.** The user reports that today's ranking often misses the result they wanted. The port keeps it as is (§3.5), so `ranked.json` guards against accidental change, not for quality. Reworking it is a separate task; `go test -update` rewrites the golden file when the ranking changes on purpose.
