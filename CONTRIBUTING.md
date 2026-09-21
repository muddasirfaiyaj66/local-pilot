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

## Code map

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

Follow `design-system/localpilot/MASTER.md`. Use Phosphor icons — no emoji-as-icons. Keep TypeScript strict; avoid `any`.

## Commits

Clear, imperative messages focused on **why** (e.g. `fix streaming abort leaving zombie AbortController`).

## Pull requests

- Describe what changed and how to test it manually
- Include screenshots for UI changes
- Do not commit secrets, `.env`, or real API keys
