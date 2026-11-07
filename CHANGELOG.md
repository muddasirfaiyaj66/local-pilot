# Changelog

All notable changes to LocalPilot will be documented here.

## [Unreleased]

### Added

- **Code view** (`Ctrl/Cmd+2`): a VS Code-style editor built on Monaco — file explorer with create/rename/delete-to-trash, tabs with dirty markers, breadcrumbs, minimap, sticky scroll, quick open (`Ctrl+P`), find in files with case/word/regex, an integrated terminal panel, "Run file" (`Ctrl+F5`), and editor themes/font/minimap/format-on-save settings
- **Inline AI edits** (`Ctrl/Cmd+I`): rewrite the selection with the active model, review a side-by-side diff, accept as one undoable edit; "Ask about selection in chat" (`Ctrl+Shift+L`)
- **Plugins & Extensions marketplace**: declarative JSON plugins that add editor themes, snippets, AI prompt commands (chat or inline), and MCP servers; 12 built-in plugins, install from file, or create one from a template. Plugins never run code inside the app
- **Provider gallery** with 21 presets — free keys (Groq, Gemini, OpenRouter free models, Cerebras, Mistral, GitHub Models, NVIDIA NIM, Hugging Face, SambaNova, Cohere), local runtimes (Ollama, LM Studio, llama.cpp, Jan), and paid APIs (OpenAI, Anthropic, DeepSeek, xAI, Together, Fireworks, Perplexity) — each with a "Get key" link, model quick-picks, and key status
- **Fallback chain**: when the active provider fails before answering (bad key, exhausted quota, outage), the request moves to the next configured provider and a notice says so
- **Model Arena** (`Ctrl/Cmd+4`): send one prompt to up to four models at once and compare time-to-first-token, total time, throughput, and answers; vote to build a local leaderboard
- Settings reorganised into sections (Models & keys, Fallback chain, Workspace & agent, Appearance, MCP, Memory, Audit, About)

### Fixed

- Dialog panels sat below their own backdrop, so clicks inside approvals and other modals were swallowed
- Editors no longer risk saving a truncated buffer over a large file: reads report `truncated`/`binary` and such files open read-only

- Agent runs execute every tool the model requests in a turn: independent read-only tools run in parallel (bounded), while state-changing or approval-gated tools stay serial
- A model turn that fails transiently (rate limit, 5xx, dropped connection) is retried with jittered backoff before the run gives up, and the retry is surfaced as a notice
- Native Anthropic (Messages API) and Google Gemini (generateContent) providers, with real tool calling, image input, and usage; OpenAI-compatible gateways still work via the `openai-compat` kind
- Reasoning/thinking output is streamed and shown in a collapsible "Thinking" block (OpenAI `reasoning_content`, Anthropic thinking deltas, Ollama `thinking`, Gemini thought parts)
- Provider config gains optional `maxTokens`, extra `headers`, and a `reasoningEnabled` toggle; usage now reports cached and reasoning tokens
- A render error boundary so one broken pane cannot blank the app

### Changed

- New design-token system: warm near-black surfaces with a copper accent, a 4px spacing scale, an expanded type/motion scale, and a visible 2px focus ring on every control
- The chat shell is now a resizable operator console: drag handles resize the session list and inspector, panes collapse from the title bar, and a bottom status bar shows model, mode, tokens, servers, and agents
- A smaller ABI-friendly virtualization pass keeps long transcripts fast, and the transcript only announces new messages to screen readers
- Approvals, the command palette, and Flow Engine confirmations use a proper dialog with focus trap, Escape, and focus restore
- Softer responsive behavior: the inspector and session list drop away as the window narrows

### Added

- Command palette (`Ctrl/Cmd+K`) with keyboard shortcuts for chat, settings, Flow Engine, new chat, and pane toggling
- Paste images straight into the composer

## [0.16.0] — 2026-10-03

### Fixed

- File edits fail when the snippet matches more than once, instead of changing only the first copy
- Git commit stages new files in the workspace before committing
- Browser screenshots include their pixel size and no longer replace a desktop frame used for clicks
- Renamed plan steps stay renamed when the run updates step status
- Saving MCP config reloads those servers
- Tool output in the log is no longer cut to a single short line
- Very large file writes stay on disk and are left out of the in-app review payload

### Added

- File search is case-insensitive and can take a glob
- Clicking a file in the context pane inserts `@path` into the composer
- The screen crosshair sits on the picture, including letterboxed frames
- Settings can list and delete memory notes

## [0.15.0] — 2026-10-03

### Added

- Screenshots from the desktop and browser are sent to the model, and clicks are scaled to physical pixels on HiDPI displays
- Review changes by hunk, with Keep and Undo per change, one checkpoint per Agent run, and Revert run
- Plan steps show status, can be renamed, and Build switches to Agent and runs the plan
- Type `@` in the composer to insert a workspace file; that file is included in the model prompt
- Title bar shows the current tool and step, the sidebar shows a step line for running agents, and the context pane has a one-level file tree plus a click crosshair on the last screenshot
- Settings can list models, edit MCP servers, and read recent audit entries
- Shell commands that `cd` or redirect outside the workspace are blocked unless the run is already allowed outside

### Changed

- Layout is a 40px rail, 240px agent list, and 280px context pane

## [0.14.0] — 2026-10-03

### Added

- Chats, plans, and pending file reviews persist across restarts
- Agent and Plan runs include the earlier conversation, including image attachments, so a follow-up or "continue" keeps the thread
- Project rules from `AGENTS.md` or `.localpilot/rules`, plus recent memory notes, are included at the start of a run
- Repository index and file search skip `.gitignore` paths, dependency folders, and binary files
- Context meter uses the model's window instead of a fixed 128k, and long tool transcripts are trimmed before the next turn

### Fixed

- A failed tool result is no longer executed three times in one step; only a thrown timeout or network error is retried once, and that retry aborts the previous child
- Stop and the kill switch unblock a run that is waiting on Approve/Deny or a question
- Switching Chat / Plan / Agent while a run is streaming no longer makes Stop abort the wrong channel
- Undo of a newly created file deletes it, restore stays inside the workspace, and undo-all keeps files that failed to restore
- "Make the button blue" and "write a test" no longer take the greenfield app scaffold path
- Provider token counts are kept; the character estimate is labeled as an estimate and does not overwrite them
- Windows shell stop kills the process tree
- Deleting a non-empty directory no longer falls through to a recursive remove when trash fails

## [0.12.0] — 2026-09-21

### Added

- Running servers are visible and stoppable: a port chip with a stop button in the title bar, and a list in the App preview tab where each entry can be previewed or stopped

### Changed

- Starting a dev server that is already running reuses it instead of spawning another on a new port (pass `restart: true` to force a fresh one)
- Agent work rules: read before editing, keep one dev server, verify with evidence from logs or the page, and state what is unverified rather than declaring success

## [0.11.0] — 2026-09-21

### Added

- **Agent step budget** in Settings (default 60, was a hard-coded 20)

### Changed

- Hitting the step limit now spends one tool-free turn summarising what is done, what remains, and the next step — instead of only “Stopped at step limit”
- The agent is warned when 5 steps remain so it wraps up useful work
- Re-running the same inspect tool (screenshots, DOM snapshots, file reads) a third time prompts the agent to act on what it already has

## [0.10.1] — 2026-09-21

### Fixed

- Failed shell commands are reported as failures — a non-zero exit code used to come back as success, so the agent kept retrying
- Interactive generators (`npm create vite`, `npm init`) no longer stall the run: commands get no TTY, run with `CI=1` / `npm_config_yes`, and a cancelled prompt returns actionable guidance
- Near-identical retries are detected and blocked after repeated failures, instead of burning the whole step budget on flag tweaks
- Greenfield builds write project files directly rather than invoking interactive scaffolders

## [0.10.0] — 2026-09-21

### Added

- **Run the app you build:** `proc_start`, `proc_logs`, and `proc_stop` tools keep dev servers alive in the background, detect the `http://localhost` URL, and stream startup output
- **App preview tab** in the context pane renders the running dev server, with reload and open-in-browser

### Changed

- Build goals follow a quality bar: scaffold with real tooling, match config to installed versions, avoid remote assets that render as broken placeholders, then install, run, and verify the dev server before finishing
- Create/build runs get a higher step budget so scaffold → install → run → fix fits in one turn

### Fixed

- Shell commands containing quotes no longer get mangled on Windows (verbatim arguments), which broke scaffolding commands

## [0.9.0] — 2026-09-21

### Added

- Markdown rendering in chat: headings, bold, lists, tables, code blocks, and clickable links that open in the system browser

### Fixed

- Answers no longer appear twice — the run summary is only appended when it adds new text
- Streaming reply renders as the assistant message instead of being wrapped in a thought block

## [0.8.7] — 2026-09-21

### Fixed

- Kill switch accelerator uses Electron’s `.` key code (not `Period`), with try/catch so a bad chord cannot crash startup

## [0.8.6] — 2026-09-21

### Fixed

- Kill switch registers on Windows — `Ctrl+Shift+Esc` is reserved for Task Manager; use `Ctrl/Cmd+Shift+.` (with fallbacks)

## [0.8.5] — 2026-09-21

### Changed

- Agent UI follows a Cursor-style transcript pattern: collapsible Thought and tool-exploration blocks in chat, user bubbles, denser Agents sidebar, mode pill in the title bar, and a compact Screen/Log context pane

## [0.8.4] — 2026-09-21

### Fixed

- Agent no longer hangs forever on “Thinking…” after tool writes — model stream idle/total timeouts, clearer waiting status, Ollama tool-call message format for multi-turn cloud models, post-write continue nudge

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
