# CLAUDE.md

VexWave: a desktop music player for Windows (WebView2) and Linux (WebKitGTK 6.0) on Wails v3.1.0 and Go 1.27, with the React UI in `frontend/`.

- **Spec:** `docs/wails-port-audit.md`. Its Ground rules bind every change. Where it says nothing, do what the Electrobun app does.
- **Behavioural reference:** the Electrobun app, checked out at `../vex-app-electrobun` (the report's Port setup says how to create it). The report's `file:line` references resolve there.
- **bun only:** npm and node aren't installed. Use `bun` and `bunx`, including for the shadcn CLI (`bunx shadcn add <component>` in `frontend/`).
- **Indentation:** tabs in TS, JS, CSS and JSON. Go is `gofmt`.
- **Comments:** only what reading the code can't tell you: a fact from outside the repo (an upstream bug, OS or browser behaviour, a spec, where a magic number comes from) or a trap where code looks wrong or removable but isn't. If the code, a config it points at, or a failing build or test would tell you, it gets no comment. No package, type, function or test descriptions. One line, two at most, in the present tense, stating the reason directly. History goes in commit messages.
- **Comments left as they are:** `contract/contract.ts` is a verbatim copy of `vex-backend`'s and changes only there. `frontend/src/components/ui/` keeps what shadcn generates, and `build/**/Taskfile.yml`, `build/config.yml` and `project.nsi` keep Wails' template comments. The comments in `.claude/skills/preview/` are the skill's instructions.
- **Keep this file short:** structure, rules that span files, and what the code can't say. The spec lives in the report.
