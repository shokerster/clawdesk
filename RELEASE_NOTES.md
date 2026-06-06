# ClawDesk v0.1.1

Attachment-enabled local desktop release for OpenClaw users. This build is verified on macOS; Windows and Linux artifacts remain internal-testing targets until platform QA is complete.

## Includes

- Electron desktop app verified on macOS, with Windows and Linux build targets available for internal QA.
- Local OpenClaw chat through `openclaw agent`.
- Native chat file attachments: the `+` button opens a file picker, copies selected files into the OpenClaw workspace, and sends those paths to the agent.
- Local session renaming for clearer conversation history.
- Dashboard for Gateway health, sessions, skills, cron jobs, channels, and usage.
- Agents, sessions, memory, usage, crons, logs, settings, and about views.
- Default model selector with custom `provider/model` input.
- Gateway start, stop, restart, and Control UI quick actions.

## Release Assets

- `ClawDesk-0.1.1-universal.dmg` - macOS universal installer
- `ClawDesk-0.1.1-universal-mac.zip` - macOS universal zip
- `ClawDesk.Setup.0.1.1.exe` - Windows installer
- `ClawDesk.0.1.1.exe` - Windows portable app
- `ClawDesk-0.1.1.AppImage` - Linux AppImage
- `clawdesk-0.1.1.tar.gz` - Linux archive
- `SHASUMS256.txt` - SHA-256 checksums

## Known Limits

- Builds are unsigned and not notarized.
- Public release readiness is macOS-first until Windows and Linux CLI discovery, install, and runtime behavior are verified on those platforms.
- Windows builds currently use the default Electron icon.
- Linux `.deb` is not included because macOS cross-build verification produced an invalid package stub.
- Requires an existing local OpenClaw install.
- Native approval queue UI is not wired yet.
