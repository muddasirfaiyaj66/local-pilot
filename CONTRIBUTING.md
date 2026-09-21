# Contributing to LocalPilot

Thanks for helping build a local-first desktop agent.

## Development

```bash
npm install
npm run dev
```

Before opening a PR:

```bash
npm run typecheck
npm test
npm run build
```

## Phase discipline

Work **one phase at a time** (see README roadmap). Prefer finishing and demonstrating the current phase over jumping ahead.

| Area | Location |
|------|----------|
| Agent loop | `src/main/agent/` |
| Providers | `src/main/providers/` |
| Tools | `src/main/tools/` |
| Safety | `src/main/safety/` |
| UI | `src/renderer/` |
| Shared types | `src/shared/` |
| Design system | `design-system/localpilot/` |

## UI

Follow `design-system/localpilot/MASTER.md` (Cursor-type dark IDE). Use Phosphor icons — no emoji-as-icons. Keep TypeScript strict; avoid `any`.

## Commits

Clear, imperative messages focused on **why** (e.g. `fix streaming abort leaving zombie AbortController`).

## Pull requests

- Describe the phase and what to test manually
- Include screenshots for UI changes
- Do not commit secrets, `.env`, or real API keys
