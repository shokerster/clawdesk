# ClawDesk

Desktop control center for a local OpenClaw install.

ClawDesk gives OpenClaw users an Electron app for chat, gateway health, usage, sessions, memory files, cron jobs, logs, model configuration, and local quick actions.

![ClawDesk dashboard](docs/screenshots/dashboard.png)

## Screenshots

![ClawDesk chat](docs/screenshots/chat.png)

![ClawDesk about](docs/screenshots/about.png)

## Features

- Chat through the local `openclaw agent` CLI.
- Attach files in chat with the `+` button. ClawDesk saves them into the OpenClaw workspace and gives the agent the local paths.
- View Gateway status, health, node presence, and log tail.
- Inspect recent sessions, configured agents, workspace memory files, skills, and cron jobs.
- Review local usage estimates from `openclaw gateway usage-cost`.
- Change the default OpenClaw model from the Settings panel.
- Start, stop, and restart the local Gateway.
- Built from one Electron codebase, currently verified on macOS. Windows and Linux are unverified internal QA build targets until tested on those platforms.

## Requirements

- OpenClaw installed locally.
- Node.js and npm for development builds.
- macOS for the currently verified local workflow. Windows and Linux require platform-specific verification before public release.

## Install From Release

Download the macOS artifact from the GitHub release. The current public developer-preview build has been verified on macOS only; Windows and Linux are unverified internal QA targets until platform testing is complete.

- macOS DMG: `ClawDesk-0.1.2-universal.dmg`
- macOS ZIP: `ClawDesk-0.1.2-universal-mac.zip`

The current macOS builds are unsigned and not notarized, so macOS will show a security warning on first launch.

## How to Open on macOS

ClawDesk is currently distributed as an unsigned developer-preview app. After downloading the DMG or ZIP from GitHub Releases:

1. Open the DMG and drag ClawDesk into Applications, or unzip the ZIP and move `ClawDesk.app` into Applications.
2. Open Finder, go to Applications, then Control-click or right-click `ClawDesk.app`.
3. Choose Open.
4. In the macOS warning dialog, choose Open again.

If macOS still blocks the app, open System Settings, go to Privacy & Security, and use the Open Anyway prompt for ClawDesk.

## Run Locally

```bash
npm install
npm start
```

## Build

```bash
npm run build:mac
npm run build:win
npm run build:linux
npm run check:security
```

Release files are written to `release/`. Only macOS DMG/ZIP artifacts should be attached to the public developer-preview release until Windows and Linux have been tested on their target platforms.

## Security Checks

Run these before publishing a release:

```bash
npm run check:security
npm audit
```

`npm run check:security` verifies the Electron hardening assumptions this app depends on: CSP is present, inline scripts and unsafe eval are blocked, renderer context isolation and sandboxing stay enabled, unexpected navigation/new windows are denied, exposed preload inputs are sanitized, local file opens go through an allowlist, and external URL opening is limited to loopback URLs.

## Contributing

Contributions are welcome. You may fork ClawDesk for the purpose of proposing
changes back to the project. See [CONTRIBUTING.md](CONTRIBUTING.md) before
opening an issue or pull request.

## Current Status

This is a v0.1 local desktop build. It is useful for testing and early OpenClaw users, but it is not notarized, code-signed, or packaged with an OpenClaw installer.

Known limits:

- Public-release readiness is macOS-first right now; Windows and Linux are unverified internal QA targets until installation, CLI discovery, and runtime behavior are tested on those platforms.
- Windows builds currently use the default Electron icon.
- Linux `.deb` is not shipped from macOS cross-builds; use AppImage or tar.gz.
- Native approval queue UI is not wired yet.
- ClawDesk expects an existing local OpenClaw install.

## License

Source-available contribution license. You can view, evaluate, fork, and modify
ClawDesk for contributions, but redistribution, resale, competing derivatives,
and unofficial packaged builds are not allowed without written permission. See
[LICENSE](LICENSE).
