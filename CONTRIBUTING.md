# Contributing to ClawDesk

ClawDesk welcomes focused contributions that make the app more useful for local
OpenClaw users.

## What You Can Do

- Fork the repository for the purpose of proposing a change.
- Open issues for bugs, confusing UI, install problems, and feature requests.
- Open pull requests with fixes or improvements.
- Test the app locally while preparing a contribution.

The project is source-available, not open-source. See [LICENSE](LICENSE) for the
exact permissions and restrictions.

## Good First Contributions

- Bug fixes with clear reproduction steps.
- UI polish that keeps the current ClawDesk style.
- Cross-platform fixes for macOS, Windows, or Linux.
- Better error messages around local OpenClaw setup.
- Documentation that helps users install, run, or troubleshoot ClawDesk.

## Before Opening a Pull Request

Run the app locally:

```bash
npm install
npm start
```

For build-related changes, run the relevant platform build when possible:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

If you cannot run a build, say that in the pull request.

## Pull Request Notes

Please include:

- what changed;
- why it changed;
- how you tested it;
- screenshots for visible UI changes.

Keep pull requests small and focused. Large rewrites are harder to review and
less likely to land quickly.

## Contribution License

By submitting a pull request, patch, issue comment with code, or other
contribution, you agree that FredBuilds may use, modify, publish, distribute,
sublicense, and commercialize your contribution as part of ClawDesk or related
FredBuilds products and services.

Do not submit code you do not have the right to contribute.

## Security

Do not open public issues for secrets, token leaks, auth bypasses, or serious
security problems. Email `support@fredbuilds.co` with the details instead.
