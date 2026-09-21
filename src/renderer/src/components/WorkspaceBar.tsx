import { FolderOpen, X } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Workspace chip in the title bar */
export function WorkspaceChip(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const clearWorkspace = useAppStore((s) => s.clearWorkspace)
  const path = settings?.workspacePath?.trim() ?? ''

  if (!path) {
    return (
      <button
        type="button"
        onClick={() => void openWorkspace()}
        className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-[var(--color-border-strong)] px-1.5 text-[11px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
        title="Open Folder — required for Agent / Plan file tools"
      >
        <FolderOpen size={12} aria-hidden />
        Open Folder
      </button>
    )
  }

  return (
    <div
      className="group inline-flex h-6 max-w-[220px] items-center gap-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] pl-1.5 pr-0.5"
      title={path}
    >
      <button
        type="button"
        onClick={() => void openWorkspace()}
        className="inline-flex min-w-0 items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <FolderOpen size={12} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
        <span className="truncate font-medium text-[var(--color-text)]">{basename(path)}</span>
      </button>
      <button
        type="button"
        className="lp-icon-btn !h-5 !w-5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Clear workspace"
        title="Clear workspace"
        onClick={() => void clearWorkspace()}
      >
        <X size={10} aria-hidden />
      </button>
    </div>
  )
}

/** Banner when Agent/Plan needs a folder */
export function WorkspaceBanner(): React.JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const interactionMode = useAppStore((s) => s.interactionMode)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const path = settings?.workspacePath?.trim() ?? ''

  if (path || interactionMode === 'chat') return null

  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-warn)]/25 bg-[color-mix(in_oklab,var(--color-warn)_7%,transparent)] px-3">
      <div className="min-w-0 truncate text-[11px] text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">No folder open.</span>{' '}
        Open a project so Agent / Plan can edit files.
      </div>
      <button
        type="button"
        onClick={() => void openWorkspace()}
        className="shrink-0 rounded bg-[var(--color-accent)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-2)]"
      >
        Open Folder
      </button>
    </div>
  )
}
