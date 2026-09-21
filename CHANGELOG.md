# Changelog

All notable changes to LocalPilot will be documented here.

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
