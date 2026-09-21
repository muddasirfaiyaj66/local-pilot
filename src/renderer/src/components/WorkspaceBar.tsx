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
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--color-border-strong)] px-2 py-0.5 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
        title="Open Folder — required for Agent / Plan file tools"
      >
        <FolderOpen size={14} aria-hidden />
        Open Folder
      </button>
    )
  }

  return (
    <div
      className="group inline-flex max-w-[280px] items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5"
      title={path}
    >
      <button
        type="button"
        onClick={() => void openWorkspace()}
        className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <FolderOpen size={14} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
        <span className="truncate font-medium text-[var(--color-text)]">{basename(path)}</span>
      </button>
      <button
        type="button"
        className="lp-icon-btn !h-5 !w-5 opacity-0 group-hover:opacity-100"
        aria-label="Clear workspace"
        title="Clear workspace"
        onClick={() => void clearWorkspace()}
      >
        <X size={10} aria-hidden />
      </button>
    </div>
  )
}

/** Prominent banner when Agent/Plan needs a folder */
export function WorkspaceBanner(): React.JSX.Element | null {
  const settings = useAppStore((s) => s.settings)
  const interactionMode = useAppStore((s) => s.interactionMode)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const path = settings?.workspacePath?.trim() ?? ''

  if (path || interactionMode === 'chat') return null

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-warn)]/30 bg-[color-mix(in_oklab,var(--color-warn)_8%,transparent)] px-4 py-2">
      <div className="min-w-0 text-[12px] text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">No folder open.</span>{' '}
        Open a project folder so Agent / Plan can edit files.
      </div>
      <button
        type="button"
        onClick={() => void openWorkspace()}
        className="shrink-0 rounded-md bg-[var(--color-accent)] px-3 py-1 text-[12px] font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-2)]"
      >
        Open Folder
      </button>
    </div>
  )
}
