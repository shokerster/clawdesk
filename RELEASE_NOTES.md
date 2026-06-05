# ClawDesk v0.1.0

Initial local desktop release for OpenClaw users.

## Includes

- Electron desktop app for macOS, Windows, and Linux.
- Local OpenClaw chat through `openclaw agent`.
- Local session renaming for clearer conversation history.
- Dashboard for Gateway health, sessions, skills, cron jobs, channels, and usage.
- Agents, sessions, memory, usage, crons, logs, settings, and about views.
- Default model selector with custom `provider/model` input.
- Gateway start, stop, restart, and Control UI quick actions.

## Release Assets

- `ClawDesk-0.1.0-universal.dmg` - macOS universal installer
- `ClawDesk-0.1.0-universal-mac.zip` - macOS universal zip
- `ClawDesk.Setup.0.1.0.exe` - Windows installer
- `ClawDesk.0.1.0.exe` - Windows portable app
- `ClawDesk-0.1.0.AppImage` - Linux AppImage
- `clawdesk-0.1.0.tar.gz` - Linux archive
- `SHASUMS256.txt` - SHA-256 checksums

## Known Limits

- Builds are unsigned and not notarized.
- Windows builds currently use the default Electron icon.
- Linux `.deb` is not included because macOS cross-build verification produced an invalid package stub.
- Requires an existing local OpenClaw install.
- Native approval queue UI is not wired yet.
