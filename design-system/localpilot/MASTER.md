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

Instrument-panel palette: warm near-black canvas, copper interactive accent.
Brand mark stays blue; the interactive accent is intentionally not the generic tech blue.

| Role | Hex | Variable |
|------|-----|----------|
| Background | `#0b0b0c` | `--color-bg` |
| Surface | `#121214` | `--color-surface` |
| Surface raised | `#17171a` | `--color-surface-2` |
| Surface 3 | `#1e1e22` | `--color-surface-3` |
| Hover | `#202127` | `--color-hover` |
| Border | `#26262b` | `--color-border` |
| Border strong | `#35353c` | `--color-border-strong` |
| Text | `#e9e7e4` | `--color-text` |
| Text muted | `#a29d95` | `--color-text-muted` |
| Text faint | `#84807a` | `--color-text-faint` |
| Accent | `#e8963c` | `--color-accent` |
| Accent muted | `#cf8531` | `--color-accent-2` |
| On accent | `#0b0b0c` | `--color-on-accent` |
| Danger | `#e5484d` | `--color-danger` |
| Warn | `#eab308` | `--color-warn` |
| Success | `#46b17b` | `--color-ok` |
| Info | `#5b9bd5` | `--color-info` |

Scales: spacing `--space-1/2/3/4/6/9` (4px base), radii `--radius-sm/md/lg`, motion `--duration-fast/med/slow` + `--ease-out-soft`. Focus ring is a 2px accent outline with 2px offset.

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
