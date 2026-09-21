# LocalPilot

<p align="center">
  <img src="build/icon.png" alt="LocalPilot logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Cross-platform desktop AI agent</strong> that acts on your computer from a natural-language goal — browser, screen, files, shell, and more.
</p>

<p align="center">
  Local models via Ollama · Cloud APIs (OpenAI-compatible &amp; more) · Electron
</p>

---

## What it is

LocalPilot is an Electron desktop app that pairs a chat UI with an agent loop. You open a project folder, pick a model, and work in **Chat**, **Plan**, or **Agent** mode. Tools run in the main process under a workspace sandbox, with permission prompts and a global kill switch.

## Features

- **Modes:** Chat (conversation), Plan (read-only inspect + proposed steps), Agent (tools that change the world)
- **Open Folder workspace** — Agent/Plan file and shell tools are sandboxed to the selected project
- **Multi-agent** — parallel agents across chats; per-chat stop and stop-all; kill switch aborts every run
- **Providers** — Ollama (local/cloud tags) and OpenAI-compatible endpoints; API keys via Electron `safeStorage`
- **Browser** — Playwright with a persistent profile (or attach via `LOCALPILOT_CDP_URL`)
- **Screen** — desktop control + live preview; vision coordinate grounding for VL models
- **Media** — ffmpeg + sharp tools scoped to the workspace
- **MCP** — stdio servers from `mcp.json` in app userData; `mcp_reload` refreshes tools
- **Memory** — SQLite notes (`memory_*`) and task history (`node:sqlite`)
- **Diff review** — Keep / Undo for agent file changes; attachments; context/token meter
- **Safety** — permission modes, Approve/Deny previews, audit log with secret redaction, kill switch `Ctrl/Cmd+Shift+.`

## Requirements

- **Node.js 22+** (uses `node:sqlite` for memory)
- Optional: [Ollama](https://ollama.com) for local / Ollama-served models
- Optional: API key for OpenAI-compatible / OpenRouter / similar gateways

## Install & quick start

```bash
git clone https://github.com/muddasirfaiyaj66/local-pilot.git
cd local-pilot
npm install
npm run dev
```

If Electron’s install script was blocked by your npm policy:

```bash
npm install-scripts approve electron
npm rebuild electron
```

### First run

1. Open **Settings** (gear in the activity rail).
2. Confirm or add a provider:
   - **Ollama:** base URL `http://127.0.0.1:11434`, model e.g. `gemma4:31b-cloud` → **Test connection**
   - **OpenAI-compatible:** base URL + API key + model
3. Use **Open Folder** to set a workspace (required for Agent / Plan tools).
4. Return to chat, choose **Chat**, **Plan**, or **Agent**, pick a model, and send a message.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Electron + Vite (development) |
| `npm run build` | Compile main / preload / renderer |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Vitest |
| `npm run pack` | Unpackaged electron-builder output |
| `npm run dist` | Installers (nsis / dmg / AppImage + deb) |

## Model recommendations

| Use case | Suggestion |
|----------|------------|
| Default (Ollama) | `gemma4:31b-cloud` |
| Stronger chat (Ollama) | `kimi-k3:cloud` |
| Local / smaller | `llama3.2`, `qwen2.5:7b` / `14b` as VRAM allows |
| Cloud (OpenAI-compatible) | `gpt-4o-mini`, or Claude/Gemini via an OpenAI-compatible gateway |
| Vision / grounding | `gemma4:31b-cloud`, `llava`, `qwen2.5-vl`, UI-TARS-class models |

Built-in defaults ship as **Gemma 4 (cloud)** and **Kimi K3 (cloud)** on Ollama’s local API.

## Architecture

```
src/main/agent/       Agent loop, planner, memory
src/main/providers/   Ollama, OpenAI-compatible (Anthropic/Gemini via gateway)
src/main/tools/       fs, shell, code, browser, screen, media, MCP, memory
src/main/safety/      Permissions, kill switch, audit log
src/renderer/         Chat UI, settings, diff review, screen preview
src/shared/           Zod schemas, IPC contracts
design-system/        UI tokens
```

**Security model:** the main process owns tools and secrets; the renderer is isolated (`contextIsolation`, no `nodeIntegration`); preload exposes a typed IPC bridge only.

## Safety

- Permission modes: **Ask always** · **Ask risky** (default) · **Autonomous**
- Risky / critical actions (posts, deletes, shell outside workspace, MCP, media writes) require preview + Approve / Deny
- Global kill switch: `Ctrl/Cmd+Shift+.` (stops all agents; Windows cannot use Ctrl+Shift+Esc — reserved for Task Manager)
- Page, file, and screenshot text is treated as data, not instructions
- API keys and passwords are not sent to models; secrets are redacted in logs

## MCP

Copy [`mcp.example.json`](mcp.example.json) to the app **userData** folder as `mcp.json`:

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

Restart LocalPilot or ask the agent to run `mcp_reload`.

## Packaging & releases

See [docs/RELEASE.md](docs/RELEASE.md) for local installers, GitHub Releases, and auto-update.

## Brand assets

| Asset | Path |
|-------|------|
| App icon (PNG) | [`build/icon.png`](build/icon.png) |
| Vector mark | [`src/renderer/src/assets/logo-mark.svg`](src/renderer/src/assets/logo-mark.svg) |
| Full mark | [`src/renderer/src/assets/logo.svg`](src/renderer/src/assets/logo.svg) |

Geometric **LP** monogram — flat blue `#3B82F6` on charcoal.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design tokens live under [`design-system/localpilot/`](design-system/localpilot/).

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
