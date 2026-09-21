# Releasing LocalPilot

## Local installers

```bash
npm ci
npm run dist
```

Artifacts land in `release/` (NSIS on Windows, DMG on macOS, AppImage + deb on Linux).

For a faster unpackaged check:

```bash
npm run pack
```

## GitHub Releases + auto-update

Packaged builds use `electron-updater` against this repo’s GitHub Releases (`electron-builder.yml` → `publish`).

1. Bump `version` in `package.json`.
2. Commit and tag: `git tag v0.8.2 && git push origin v0.8.2`
3. Publish with a token that can create releases:

```bash
# Windows (PowerShell)
$env:GH_TOKEN = "ghp_…"
npm run dist
```

Or upload the installer artifacts from CI to a Release manually. Users on packaged builds get a prompt when an update is downloaded; Settings → **Check for updates** triggers a manual check.

## CI

`.github/workflows/ci.yml` runs typecheck / test / build on Ubuntu, Windows, and macOS, then packs `--dir` artifacts on each OS.
