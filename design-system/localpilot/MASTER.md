# Design System Master File

> Cursor-type IDE agent console for LocalPilot (Electron).

**Project:** LocalPilot  
**Reference:** Cursor Agent / Composer UI (inspired, not a clone)  
**Density:** High · **Motion:** Minimal · **Mode:** Dark only

---

## Visual direction

Match **Cursor / VS Code agent** feel:

- Charcoal surfaces (`#0a0a0a` → `#1e1e1e`), hairline borders (`#2a2a2a`)
- **Blue** interactive accent (brand `#2f8df5`) — not green, not purple, not orange
- Flat panes, almost no shadows; composer gets a subtle elevation ring
- Transcript chat (no bubble cards); muted role labels
- Elevated **composer** docked at bottom of the chat column
- Narrow history rail; optional right “context / live” panel
- Icons: Phosphor outline, 14–16px
- Type: **IBM Plex Sans** UI + **IBM Plex Mono** for code/meta (not Inter)

**Logo:** Geometric **LP** monogram (LocalPilot initials). Flat blue `#2F8DF5` on charcoal. Assets: `build/icon.png`, `src/renderer/src/assets/logo-mark.svg`.

**Avoid:** mint/teal dashboards, AI purple glow, marketing heroes, heavy cards, green “run” CTAs, clipart-style pictorial marks.

---

## Tokens

Instrument-panel palette: cool near-black canvas, LocalPilot brand blue (the logo blue) as the only accent. No orange/copper.

Use `--color-accent` for text, links, indicators, and focus rings (5.6:1 on the background). Filled controls with a label use `--color-accent-strong`: white on the logo blue is only 3.4:1, white on the strong blue is 4.9:1.

| Role | Hex | Variable |
|------|-----|----------|
| Background | `#0b0c0e` | `--color-bg` |
| Surface | `#111215` | `--color-surface` |
| Surface raised | `#16181c` | `--color-surface-2` |
| Surface 3 | `#1c1f24` | `--color-surface-3` |
| Hover | `#20232a` | `--color-hover` |
| Border | `#262a31` | `--color-border` |
| Border strong | `#343943` | `--color-border-strong` |
| Text | `#e6e8eb` | `--color-text` |
| Text muted | `#9aa1ab` | `--color-text-muted` |
| Text faint | `#7c838e` | `--color-text-faint` |
| Accent (brand blue) | `#2f8df5` | `--color-accent` |
| Accent fill | `#1f6fd8` | `--color-accent-strong` |
| Accent fill hover | `#1a5fbf` | `--color-accent-2` |
| On accent fill | `#ffffff` | `--color-on-accent` |
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
