import { Check, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { useAppStore } from '../store/appStore'

export function DiffReviewPane(): React.JSX.Element | null {
  const pendingChanges = useAppStore((s) => s.pendingChanges)
  const acceptChange = useAppStore((s) => s.acceptChange)
  const rejectChange = useAppStore((s) => s.rejectChange)
  const acceptAllChanges = useAppStore((s) => s.acceptAllChanges)
  const rejectAllChanges = useAppStore((s) => s.rejectAllChanges)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (pendingChanges.length === 0) return null

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="text-[12px] font-medium text-[var(--color-text)]">
          Review changes
          <span className="ml-1.5 text-[var(--color-text-faint)]">({pendingChanges.length})</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] text-[var(--color-ok)] hover:bg-[var(--color-hover)]"
            onClick={() => acceptAllChanges()}
          >
            Keep all
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
            onClick={() => void rejectAllChanges()}
          >
            Undo all
          </button>
        </div>
      </div>
      <ul className="max-h-48 overflow-y-auto border-t border-[var(--color-border)]">
        {pendingChanges.map((c) => {
          const open = expanded === c.id
          return (
            <li key={c.id} className="border-b border-[var(--color-border)] last:border-0">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  onClick={() => setExpanded(open ? null : c.id)}
                >
                  {c.relativePath}
                  <span className="ml-2 text-[var(--color-text-faint)]">{c.kind}</span>
                </button>
                <button
                  type="button"
                  className="lp-icon-btn"
                  title="Keep"
                  aria-label={`Keep ${c.relativePath}`}
                  onClick={() => acceptChange(c.id)}
                >
                  <Check size={14} className="text-[var(--color-ok)]" aria-hidden />
                </button>
                <button
                  type="button"
                  className="lp-icon-btn"
                  title="Undo"
                  aria-label={`Undo ${c.relativePath}`}
                  onClick={() => void rejectChange(c.id)}
                >
                  <X size={14} className="text-[var(--color-danger)]" aria-hidden />
                </button>
              </div>
              {open && (
                <pre className="max-h-40 overflow-auto bg-[var(--color-bg)] px-3 py-2 font-[var(--font-mono)] text-[10px] leading-relaxed text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-danger)]">
                    {c.before
                      .split('\n')
                      .slice(0, 40)
                      .map((l) => `- ${l}`)
                      .join('\n')}
                  </span>
                  {'\n'}
                  <span className="text-[var(--color-ok)]">
                    {c.after
                      .split('\n')
                      .slice(0, 40)
                      .map((l) => `+ ${l}`)
                      .join('\n')}
                  </span>
                </pre>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
