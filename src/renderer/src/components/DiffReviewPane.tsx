import { CaretRight, FileCode } from '@phosphor-icons/react'
import { useState } from 'react'
import { diffHunks } from '@shared/diff'
import { useAppStore } from '../store/appStore'
import { Button } from './ui/Button'

export function DiffReviewPane(): React.JSX.Element | null {
  const pendingChanges = useAppStore((s) => s.pendingChanges)
  const checkpoint = useAppStore((s) => s.checkpoint)
  const acceptChange = useAppStore((s) => s.acceptChange)
  const rejectChange = useAppStore((s) => s.rejectChange)
  const acceptAllChanges = useAppStore((s) => s.acceptAllChanges)
  const rejectAllChanges = useAppStore((s) => s.rejectAllChanges)
  const applyHunk = useAppStore((s) => s.applyHunk)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  if (pendingChanges.length === 0) return null

  return (
    <div className="lp-review" role="region" aria-label="Review changes">
      <div className="flex h-8 items-center gap-2 border-b border-[var(--color-border)] px-2.5">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-[var(--color-text)]"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <CaretRight
            size={12}
            className={`text-[var(--color-text-faint)] transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
            aria-hidden
          />
          <span className="truncate">
            {checkpoint ? `Checkpoint · ${checkpoint.goal}` : 'Review changes'}
          </span>
          <span className="ml-0.5 font-[var(--font-mono)] text-[11px] font-normal text-[var(--color-text-faint)]">
            {pendingChanges.length}
          </span>
        </button>
        <div className="flex-1" />
        <Button variant="quiet" onClick={() => acceptAllChanges()}>
          Keep all
        </Button>
        <Button variant="danger" onClick={() => void rejectAllChanges()}>
          {checkpoint ? 'Revert run' : 'Undo all'}
        </Button>
      </div>

      {!collapsed && (
        <ul className="max-h-[220px] overflow-y-auto">
          {pendingChanges.map((change) => {
            const open = expanded === change.id
            const name = change.relativePath.split(/[/\\]/).pop() ?? change.relativePath
            const dir = change.relativePath.slice(0, Math.max(0, change.relativePath.length - name.length))
            const hunks = diffHunks(change.before, change.after)
            return (
              <li key={change.id}>
                <div className="lp-review-row">
                  <FileCode size={13} className="shrink-0 text-[var(--color-text-faint)]" aria-hidden />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-[var(--font-mono)] text-[11px] leading-none"
                    onClick={() => setExpanded(open ? null : change.id)}
                    title={change.relativePath}
                  >
                    <span className="text-[var(--color-text-faint)]">{dir}</span>
                    <span className="text-[var(--color-text)]">{name}</span>
                    <span className="ml-1.5 text-[var(--color-text-faint)]">
                      {hunks.length} {hunks.length === 1 ? 'hunk' : 'hunks'}
                    </span>
                  </button>
                  <Button variant="quiet" aria-label={`Keep ${change.relativePath}`} onClick={() => acceptChange(change.id)}>
                    Keep
                  </Button>
                  <Button
                    variant="danger"
                    aria-label={`Undo ${change.relativePath}`}
                    onClick={() => void rejectChange(change.id)}
                  >
                    Undo
                  </Button>
                </div>
                {open && (
                  <div className="space-y-2 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                    {hunks.length === 0 ? (
                      <p className="text-[11px] text-[var(--color-text-faint)]">No line changes.</p>
                    ) : (
                      hunks.map((hunk, index) => (
                        <div key={`${change.id}-${index}`} className="rounded border border-[var(--color-border)]">
                          <div className="flex items-center gap-2 px-2 py-1">
                            <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                              @@ -{hunk.beforeStart + 1} +{hunk.afterStart + 1}
                            </span>
                            <div className="flex-1" />
                            <Button variant="quiet" onClick={() => void applyHunk(change.id, index, 'keep')}>
                              Keep
                            </Button>
                            <Button variant="danger" onClick={() => void applyHunk(change.id, index, 'undo')}>
                              Undo
                            </Button>
                          </div>
                          <pre className="max-h-28 overflow-auto px-2 pb-2 font-[var(--font-mono)] text-[10px] leading-relaxed">
                            {hunk.beforeLines.map((line, lineIndex) => (
                              <div key={`d-${lineIndex}`} className="text-[var(--color-danger)]">
                                - {line}
                              </div>
                            ))}
                            {hunk.afterLines.map((line, lineIndex) => (
                              <div key={`a-${lineIndex}`} className="text-[var(--color-ok)]">
                                + {line}
                              </div>
                            ))}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
