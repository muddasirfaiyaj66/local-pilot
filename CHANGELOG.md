# Changelog

All notable changes to LocalPilot will be documented here.

## [0.8.3] — 2026-09-21

### Changed

- Chat/agent UI polish: sleek composer dock (lighter chrome, compact mode/model chips, thin context meter), IDE-style diff review panel above composer, tighter title bar / activity rail / sidebars, cleaner empty state, subtle focus and review motion

## [0.8.2] — 2026-09-21

### Changed

- README rewritten as a product overview (removed phase roadmap / status diary)
- CONTRIBUTING and SECURITY updated to match current project state
- RELEASE docs tag example aligned with current version

## [0.8.1] — 2026-09-21

### Fixed

- **Open Folder** native picker (Windows-safe dialog options, focus parent window, surface errors, refresh chip/banner/settings)
- Block Agent / Plan until a workspace folder is set (was still starting and failing with “No workspace configured”)
- Settings workspace path can be pasted/edited as a fallback

## [0.8.0] — 2026-09-21

### Added

- **Multi-agent:** run agents in parallel across chats; sidebar shows running count, per-chat stop, stop-all; kill switch stops every agent

## [0.7.1] — 2026-09-21

### Added

- Cursor-style **Open Folder** workspace picker (title chip, banner, Settings, empty state)
- Ollama provider **Kimi K3 (cloud)** (`kimi-k3:cloud`) alongside Gemma 4

## [0.7.0] — 2026-09-21

### Added

- Default Ollama model: `gemma4:31b-cloud`
- Cursor-style IDE UX: delete chat, image/file attachments, Plan mode, Keep/Undo file diffs, context/token meter
- Ollama streams real token usage when available; otherwise ~estimate shown

## [0.6.0] — 2026-09-21

### Added

- Cross-OS CI matrix (Ubuntu / Windows / macOS) with packaged `--dir` artifacts
- `electron-updater` auto-update from GitHub Releases + Settings “Check for updates”
- Release docs (`docs/RELEASE.md`); packaging config polish (icons, asarUnpack for natives)

### Fixed

- CI `npm test` on Node 20 — require Node 22+ for `node:sqlite`; Vitest mocks for Electron / nut-js

## [0.5.0] — 2026-09-21

### Added

- Media tools: ffmpeg trim/convert/subtitles/concat/extract_audio + sharp resize/crop/convert
- MCP client (stdio servers from `userData/mcp.json`; see `mcp.example.json`) + `mcp_reload`
- SQLite memory via Node `node:sqlite` — `memory_add` / `memory_search` / `memory_list` + task history on agent completion

## [0.4.0] — 2026-09-21

### Added

- Screen tools via `@nut-tree-fork/nut-js` (click, drag, type, hotkey, scroll)
- `desktopCapturer` screenshots with DPI-aware coordinate scaling for vision models
- Live screen preview pane (refresh + auto while agent runs)
- Grounding coordinate parser for UI-TARS / VL-style outputs

## [0.3.0] — 2026-09-21

### Added

- Playwright browser tools with persistent profile (logins survive restarts)
- Optional CDP attach via `LOCALPILOT_CDP_URL`
- Tools: open_url, click, type, press, scroll, screenshot, DOM snapshot, wait_for, tabs, upload_file
- `browser_publish_text` (critical) shows exact post text in Approve/Deny modal before publishing

## [0.2.0] — 2026-09-21

### Added

- Agent loop (plan → observe → one tool → verify) with mock-provider tests
- Tools: fs (read/write/edit/list/search/move/delete), shell_run, code (git/tests/index/patch), ask_user
- Permission modes enforced with Approve/Deny preview modal
- Global kill switch Ctrl/Cmd+Shift+Esc
- Audit log (JSONL) with secret redaction
- Action timeline + plan panel in the UI
- Workspace sandbox for file operations

## [0.1.0] — 2026-09-21

### Added

- Phase 1 Electron + React + Tailwind + Zustand scaffold
- Cursor-style chat UI (activity rail, history, floating composer)
- Ollama + OpenAI-compatible streaming providers
- Encrypted API key storage via Electron `safeStorage`
- LocalPilot brand mark: geometric LP monogram (professional lettermark)
- Vitest coverage for provider helpers + mock streaming
- GitHub CI workflow, MIT license, contributing & security docs
