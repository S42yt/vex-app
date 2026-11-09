# CLAUDE.md

VexWave: a Windows desktop music player on Wails v3.1.0 (Go 1.27, WebView2), with the React UI in `frontend/`.

- **Spec:** `docs/wails-port-audit.md`. Its Ground rules bind every change. Where it says nothing, do what the Electrobun app does.
- **Behavioural reference:** the Electrobun app, checked out at `../vex-app-electrobun` (the report's Port setup says how to create it). The report's `file:line` references resolve there.
- **bun only:** npm and node aren't installed. Use `bun` and `bunx`, including for the shadcn CLI (`bunx shadcn add <component>` in `frontend/`).
- **Indentation:** tabs in TS, JS, CSS and JSON. Go is `gofmt`.
- **Comments:** only for a fact from outside the repo (an upstream bug, OS or browser behaviour, a spec, where a magic number comes from) or for a trap where code looks wrong or removable but isn't. One line, two at most, in the present tense, stating the reason directly. History goes in commit messages. `frontend/src/components/ui/` keeps what shadcn generates.
- **Keep this file short:** structure, rules that span files, and what the code can't say. The spec lives in the report.
