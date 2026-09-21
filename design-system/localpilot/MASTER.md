# Design System Master File

> Cursor-type IDE agent console for LocalPilot (Electron).

**Project:** LocalPilot  
**Reference:** Cursor Agent / Composer UI (inspired, not a clone)  
**Density:** High · **Motion:** Minimal · **Mode:** Dark only

---

## Visual direction

Match **Cursor / VS Code agent** feel:

- Charcoal surfaces (`#0a0a0a` → `#1e1e1e`), hairline borders (`#2a2a2a`)
- **Blue** interactive accent (`#3b82f6`) — not green, not purple
- Flat panes, almost no shadows; composer gets a subtle elevation ring
- Transcript chat (no bubble cards); muted role labels
- Elevated **composer** docked at bottom of the chat column
- Narrow history rail; optional right “context / live” panel
- Icons: Phosphor outline, 14–16px
- Type: **IBM Plex Sans** UI + **IBM Plex Mono** for code/meta (not Inter)

**Logo:** Geometric **LP** monogram (LocalPilot initials). Flat blue `#3B82F6` on charcoal. Assets: `build/icon.png`, `src/renderer/src/assets/logo-mark.svg`.

**Avoid:** mint/teal dashboards, AI purple glow, marketing heroes, heavy cards, green “run” CTAs, clipart-style pictorial marks.

---

## Tokens

| Role | Hex | Variable |
|------|-----|----------|
| Background | `#0a0a0a` | `--bg` |
| Surface | `#111111` | `--surface` |
| Surface raised | `#171717` | `--surface-2` |
| Hover | `#1f1f1f` | `--hover` |
| Border | `#2a2a2a` | `--border` |
| Border strong | `#3a3a3a` | `--border-strong` |
| Text | `#e4e4e4` | `--text` |
| Text muted | `#8a8a8a` | `--text-muted` |
| Text faint | `#5c5c5c` | `--text-faint` |
| Accent | `#3b82f6` | `--accent` |
| Accent muted | `#2563eb` | `--accent-2` |
| On accent | `#ffffff` | `--on-accent` |
| Danger | `#ef4444` | `--danger` |
| Warn | `#eab308` | `--warn` |
| Success | `#22c55e` | `--ok` |

---

## Layout (Cursor-like)

```
┌ activity(40) ┬ history(240) ┬──────── chat ────────┬ context(280) ┐
│  Chat/Gear   │  threads     │  transcript          │  live/timeline│
│              │              │  ┌─ composer ──────┐ │               │
│              │              │  └─────────────────┘ │               │
└──────────────┴──────────────┴──────────────────────┴───────────────┘
```

Brand lives in the activity strip mark, not a marketing header.
