<div align="center">

<img src="build/appicon.png" alt="VexWave" width="112">

# VexWave

**A desktop music player conntected to your server.**

<p>
  <a href="https://v3.wails.io"><img alt="Wails" src="https://img.shields.io/badge/Wails-8B3DEE?style=flat-square"></a>
  <a href="https://go.dev"><img alt="Go" src="https://img.shields.io/badge/Go-A231FF?style=flat-square"></a>
  <a href="https://react.dev"><img alt="React" src="https://img.shields.io/badge/React-6C3BD1?style=flat-square"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-41188F?style=flat-square"></a>
</p>

<p>
  <a href="https://github.com/VexWave/vex-app/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/VexWave/vex-app/ci.yml?branch=main&label=build"></a>
  &nbsp;
  <a href="https://github.com/VexWave/vex-app/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/VexWave/vex-app?label=release&color=blue"></a>
  &nbsp;
  <a href="https://github.com/VexWave/vex-app/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/VexWave/vex-app/total?label=downloads&color=blue"></a>
</p>

<br>

<img src="assets/library.png" alt="The VexWave library, with a track playing" width="880">

</div>

<div align="right">

<a href="https://vexwave.github.io/"><img alt="vexwave.github.io" src="https://img.shields.io/badge/See_more-vexwave.github.io-8B3DEE?style=for-the-badge"></a>

</div>

## Features

| Feature | What it does |
| --- | --- |
| **Your library** | Your whole collection lives on your own server. |
| **Import from a link** | Add a track directly from a YouTube or SoundCloud URL. |
| **Discover** | Search YouTube and SoundCloud in-app and load them into your library. |
| **Equalizer** | Ten sliders to shape the sound |
| **Effects** | Adjust the speed, drive and reverb. |
| **Discord Rich Presence** | Put what you're listening to on your profile. |

## Installation

> [!IMPORTANT]
> VexWave is the client half only. Every track streams from a server you run, so set one up first:
> **[VexWave/vex-backend](https://github.com/VexWave/vex-backend)**.

### From a release

Download `VexWave-Setup.exe` from the **[latest release](https://github.com/VexWave/vex-app/releases/latest)**
and run it.

> [!NOTE]
> First launch downloads yt-dlp, ffmpeg and deno before showing the login screen.

### From source

Needs **[Bun](https://bun.sh) 1.3+**.

```sh
git clone https://github.com/VexWave/vex-app.git
cd vex-app
bun install
```

| Command | What it does |
| --- | --- |
| `bun run dev:hmr` | Develop, with Vite HMR |
| `bun run start` | Build and run from bundled assets |
| `bun run build:installer:stable` | Build `installers/VexWave-Setup.exe` |
