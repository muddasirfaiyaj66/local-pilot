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

**Phase 6 complete** — packaging, 3-OS CI, GitHub Releases auto-update, release docs.

## Screenshots / brand

| Asset | Path |
|-------|------|
| App icon (PNG) | [`build/icon.png`](build/icon.png) |
| Vector mark | [`src/renderer/src/assets/logo-mark.svg`](src/renderer/src/assets/logo-mark.svg) |
| Full mark | [`src/renderer/src/assets/logo.svg`](src/renderer/src/assets/logo.svg) |

**Logo:** Geometric **LP** monogram (LocalPilot) — flat blue `#3B82F6` on charcoal. No clipart pin/plane. Assets: `build/icon.png`, `src/renderer/src/assets/logo-mark.svg`.

## Features (Phase 5)

- Agent + Chat; workspace-sandboxed fs/shell/code tools
- **Playwright** browser with persistent profile (or CDP via `LOCALPILOT_CDP_URL`)
- Screen control + live preview; vision coordinate grounding
- **Media:** ffmpeg + sharp tools under the workspace
- **MCP:** configure servers in `mcp.json` (userData); `mcp_reload` refreshes tools
- **Memory:** SQLite notes (`memory_*`) and task history
- Permission modes + kill switch `Ctrl/Cmd+Shift+Esc`
- Plan + action timeline

## Requirements

- **Node.js 22+** (uses `node:sqlite` for memory)
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
| Local, fast | `gemma4:31b-cloud` (default), `llama3.2`, `qwen2.5:7b` |
| Local, stronger | `qwen2.5:14b` / larger if VRAM allows |
| Cloud chat | `gpt-4o-mini`, Claude via OpenRouter (`…/api/v1`) |
| Vision | `gemma4:31b-cloud`, `llava`, `qwen2.5-vl`, UI-TARS-class models |

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
| 2 | Agent loop, fs/shell/code, permissions, kill switch | ✅ |
| 3 | Playwright browser (persistent profile), post approval | ✅ |
| 4 | Screen control, vision grounding, live preview | ✅ |
| 5 | Media (ffmpeg/sharp), MCP client, SQLite memory | ✅ |
| 6 | Packaging, CI matrix, auto-update, docs polish | ✅ |

## Safety

- Permission modes: Ask always · Ask risky (default) · Autonomous
- Risky actions (posts, deletes, shell outside workspace, MCP, media writes) require preview + Approve/Deny
- Global kill switch: `Ctrl/Cmd+Shift+Esc`
- Untrusted content defense: page/file/screenshot text is data, not instructions
- Never send API keys/passwords to models; secrets redacted in logs

## MCP config

Copy [`mcp.example.json`](mcp.example.json) to the app userData folder as `mcp.json`:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"]
    }
  ]
}
```

Then restart LocalPilot or ask the agent to run `mcp_reload`.

## Known limitations

- Anthropic / Gemini kinds use OpenAI-compatible gateways only
- Chat history is in-memory for the session
- Auto-update requires a published GitHub Release matching `package.json` version
- Prefer DOM/browser tools over pixel clicking when possible

## Packaging

See [docs/RELEASE.md](docs/RELEASE.md) for installers and publishing updates.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design tokens live under [`design-system/localpilot/`](design-system/localpilot/).

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
