# ClawDesk v0.1.2 Developer Preview

Hardened unsigned macOS developer-preview release for OpenClaw users. This build is verified on macOS; Windows and Linux remain unverified internal QA targets until platform testing is complete.

## Includes

- Electron desktop app verified on macOS, with Windows and Linux build targets available for unverified internal QA only.
- Hardened Electron renderer defaults: context isolation, disabled Node integration, renderer sandboxing, guarded navigation, denied new windows, sanitized preload inputs, allowlisted local file opens, and loopback-only external URL opening.
- Release security checks through `npm run check:security` and `npm audit`.
- Local OpenClaw chat through `openclaw agent`.
- Native chat file attachments: the `+` button opens a file picker, copies selected files into the OpenClaw workspace, and sends those paths to the agent.
- Local session renaming for clearer conversation history.
- Dashboard for Gateway health, sessions, skills, cron jobs, channels, and usage.
- Agents, sessions, memory, usage, crons, logs, settings, and about views.
- Default model selector with custom `provider/model` input.
- Gateway start, stop, restart, and Control UI quick actions.

## Release Assets

- `ClawDesk-0.1.2-universal.dmg` - macOS universal installer
- `ClawDesk-0.1.2-universal-mac.zip` - macOS universal zip
- `SHASUMS256.txt` - SHA-256 checksums

Do not attach Windows or Linux artifacts to the public developer-preview release until those builds have been tested on their target platforms.

## How to Open on macOS

This release is unsigned and not notarized. After downloading:

1. Open the DMG and drag ClawDesk into Applications, or unzip the ZIP and move `ClawDesk.app` into Applications.
2. In Finder, go to Applications and Control-click or right-click `ClawDesk.app`.
3. Choose Open, then choose Open again in the macOS warning dialog.
4. If macOS still blocks the app, open System Settings > Privacy & Security and use Open Anyway for ClawDesk.

## Known Limits

- Builds are unsigned and not notarized.
- Public release readiness is macOS-first until Windows and Linux CLI discovery, install, and runtime behavior are verified on those platforms.
- Windows builds currently use the default Electron icon.
- Linux `.deb` is not included because macOS cross-build verification produced an invalid package stub.
- Requires an existing local OpenClaw install.
- Native approval queue UI is not wired yet.
