# LocalPilot

<p align="center">
  <img src="build/icon.png" alt="LocalPilot logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Cross-platform desktop AI agent</strong> that controls your computer from a natural-language goal — browser, apps, files, and terminal.
</p>

<p align="center">
  Local models (Ollama, LM Studio, llama.cpp) · Cloud APIs (OpenAI-compatible & more) · Electron
</p>

---

## Status

**Phase 1** — Electron scaffold, Cursor-style chat UI, Ollama + OpenAI-compatible providers, streaming, encrypted API keys.

Phases 2–6 add the agent loop, tools, browser/screen control, media/MCP, and packaging. See [Roadmap](#roadmap).

## Screenshots / brand

| Asset | Path |
|-------|------|
| App icon (PNG) | [`build/icon.png`](build/icon.png) |
| Vector mark | [`src/renderer/src/assets/logo-mark.svg`](src/renderer/src/assets/logo-mark.svg) |
| Full mark | [`src/renderer/src/assets/logo.svg`](src/renderer/src/assets/logo.svg) |

**Logo:** Geometric **LP** monogram (LocalPilot) — flat blue `#3B82F6` on charcoal. No clipart pin/plane. Assets: `build/icon.png`, `src/renderer/src/assets/logo-mark.svg`.

## Features (Phase 1)

- One Electron + TypeScript codebase (Windows / macOS / Linux ready)
- Chat UI inspired by Cursor (activity rail, history, transcript, floating composer)
- **Ollama** native streaming + **OpenAI-compatible** endpoints (OpenAI, OpenRouter, LM Studio, llama.cpp server)
- Cancellable streams (Stop)
- Settings: providers, models, vision flag, workspace path
- API keys via Electron `safeStorage`
- Strict TypeScript + Vitest

## Requirements

- **Node.js 20+**
- Optional: [Ollama](https://ollama.com) for local models
- Optional: API key for cloud / OpenRouter / etc.

## Quick start

```bash
git clone https://github.com/muddasirfaiyaj66/local-pilot.git
cd local-pilot
npm install
npm run dev
```

> If Electron’s install script was blocked by your npm policy, approve it once:  
> `npm install-scripts approve electron` then `npm rebuild electron`.

### First chat

1. Open **Settings** (gear in the activity rail).
2. **Ollama:** base URL `http://127.0.0.1:11434`, model e.g. `llama3.2` → **Test connection**.  
   Or set an **OpenAI-compatible** base URL + API key + model.
3. Return to **Chat**, pick the model in the composer, send a message.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Electron + Vite (development) |
| `npm run build` | Compile main / preload / renderer |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Vitest |
| `npm run pack` | Unpackaged electron-builder output |
| `npm run dist` | Installers (nsis / dmg / AppImage+deb) |

## Model recommendations

| Use case | Suggestion |
|----------|------------|
| Local, fast | `llama3.2`, `qwen2.5:7b` (Ollama) |
| Local, stronger | `qwen2.5:14b` / larger if VRAM allows |
| Cloud chat | `gpt-4o-mini`, Claude via OpenRouter (`…/api/v1`) |
| Vision (later) | `llava`, `qwen2.5-vl`, UI-TARS-class models |

## Architecture

```
src/main/agent/       loop, planner, memory          (Phase 2 / 5)
src/main/providers/   ollama, openaiCompat, …        (Phase 1 ✅)
src/main/tools/       browser, screen, shell, fs…    (Phases 2–5)
src/main/safety/      permissions, killswitch, audit (Phase 2)
src/renderer/         Cursor-style chat UI           (Phase 1 ✅)
src/shared/           Zod schemas, IPC contracts
design-system/        UI tokens (UI UX Pro Max)
```

**Security model (target):** main process owns tools & secrets; renderer is isolated (`contextIsolation`, no `nodeIntegration`); preload exposes a typed IPC bridge only.

## Roadmap

| Phase | Focus | Status |
|-------|--------|--------|
| 1 | Scaffold, chat UI, providers, streaming | ✅ |
| 2 | Agent loop, fs/shell/code, permissions, kill switch | Next |
| 3 | Playwright browser (persistent profile), post approval | Planned |
| 4 | Screen control, vision grounding, live preview | Planned |
| 5 | ffmpeg/sharp, MCP client, SQLite memory | Planned |
| 6 | Packaging, CI matrix, auto-update, docs polish | Planned |

## Safety

- Permission modes: Ask always · Ask risky (default) · Autonomous — **UI in Phase 1, enforcement in Phase 2**
- Risky actions (posts, deletes, shell outside workspace, credentials) will require preview + Approve/Deny
- Global kill switch planned: `Ctrl/Cmd+Shift+Esc`
- Untrusted content defense: page/file/screenshot text is data, not instructions
- Never send API keys/passwords to models; secrets redacted in logs

## Known limitations (Phase 1)

- No tool execution yet (cannot drive browser/desktop/files)
- Anthropic / Gemini kinds use OpenAI-compatible gateways only
- Chat history is in-memory for the session
- Live view / action timeline are placeholders
- Installer CI not fully validated until Phase 6

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design tokens live under [`design-system/localpilot/`](design-system/localpilot/).

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
