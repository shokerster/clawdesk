# GitHub Upload Guide

## Repo

Suggested repo name: `clawdesk`

Suggested description:

```text
Desktop control center for local OpenClaw installs.
```

Suggested topics:

```text
openclaw, desktop-app, electron, ai-agent, automation, local-first, macos, windows, linux
```

Suggested visibility: public source-available, not open-source yet.

License state: all rights reserved. See `LICENSE`.

## Source Push

After the GitHub repo exists:

```bash
cd /Users/shokerster/.openclaw/workspace/business/ideas/clawdesk/app
git remote add origin <repo-url>
git push -u origin main
```

Verify the current local commit:

```bash
git log --oneline --format='%h %an <%ae> %s' -1
```

## Release

Tag:

```text
v0.1.0
```

Release title:

```text
ClawDesk v0.1.0
```

Release notes:

Use `RELEASE_NOTES.md`.

## Release Assets

Upload these files from `release/`:

```text
ClawDesk-0.1.0-universal.dmg
ClawDesk-0.1.0-universal-mac.zip
ClawDesk Setup 0.1.0.exe
ClawDesk 0.1.0.exe
ClawDesk-0.1.0.AppImage
clawdesk-0.1.0.tar.gz
SHASUMS256.txt
```

Do not upload:

```text
release/mac-universal/
release/win-unpacked/
release/linux-unpacked/
*.blockmap
builder-debug.yml
```

## GitHub CLI Commands

If `gh` is installed and authenticated:

```bash
cd /Users/shokerster/.openclaw/workspace/business/ideas/clawdesk/app
gh repo create clawdesk --public --source=. --remote=origin --push
gh release create v0.1.0 \
  --title "ClawDesk v0.1.0" \
  --notes-file RELEASE_NOTES.md \
  "release/ClawDesk-0.1.0-universal.dmg" \
  "release/ClawDesk-0.1.0-universal-mac.zip" \
  "release/ClawDesk Setup 0.1.0.exe" \
  "release/ClawDesk 0.1.0.exe" \
  "release/ClawDesk-0.1.0.AppImage" \
  "release/clawdesk-0.1.0.tar.gz" \
  "release/SHASUMS256.txt"
```

Then set repo topics:

```bash
gh repo edit --add-topic openclaw --add-topic desktop-app --add-topic electron --add-topic ai-agent --add-topic automation --add-topic local-first --add-topic macos --add-topic windows --add-topic linux
```

## Manual Checks Before Publishing

- Confirm repo is not created from `/Users/shokerster/.openclaw/workspace`.
- Confirm only the app folder is pushed.
- Confirm `release/` is not committed to git.
- Confirm screenshots render in README.
- Confirm release assets match `SHASUMS256.txt`.
- Confirm release description mentions unsigned builds.
