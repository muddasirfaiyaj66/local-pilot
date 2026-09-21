import { CaretRight, FileCode } from '@phosphor-icons/react'
import { useState } from 'react'
import { useAppStore } from '../store/appStore'

export function DiffReviewPane(): React.JSX.Element | null {
  const pendingChanges = useAppStore((s) => s.pendingChanges)
  const acceptChange = useAppStore((s) => s.acceptChange)
  const rejectChange = useAppStore((s) => s.rejectChange)
  const acceptAllChanges = useAppStore((s) => s.acceptAllChanges)
  const rejectAllChanges = useAppStore((s) => s.rejectAllChanges)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  if (pendingChanges.length === 0) return null

  return (
    <div className="lp-review" role="region" aria-label="Review changes">
      <div className="flex h-8 items-center gap-2 border-b border-[var(--color-border)] px-2.5">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-text)] hover:text-[var(--color-text)]"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <CaretRight
            size={12}
            className={`text-[var(--color-text-faint)] transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
            aria-hidden
          />
          Review changes
          <span className="ml-0.5 font-[var(--font-mono)] text-[11px] font-normal text-[var(--color-text-faint)]">
            {pendingChanges.length}
          </span>
        </button>
        <div className="flex-1" />
        <button type="button" className="lp-btn-keep" onClick={() => acceptAllChanges()}>
          Keep all
        </button>
        <button type="button" className="lp-btn-undo" onClick={() => void rejectAllChanges()}>
          Undo all
        </button>
      </div>

      {!collapsed && (
        <ul className="max-h-[148px] overflow-y-auto">
          {pendingChanges.map((c) => {
            const open = expanded === c.id
            const name = c.relativePath.split(/[/\\]/).pop() ?? c.relativePath
            const dir = c.relativePath.slice(0, Math.max(0, c.relativePath.length - name.length))
            return (
              <li key={c.id}>
                <div className="lp-review-row">
                  <FileCode
                    size={13}
                    className="shrink-0 text-[var(--color-text-faint)]"
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-[var(--font-mono)] text-[11px] leading-none"
                    onClick={() => setExpanded(open ? null : c.id)}
                    title={c.relativePath}
                  >
                    <span className="text-[var(--color-text-faint)]">{dir}</span>
                    <span className="text-[var(--color-text)]">{name}</span>
                    <span className="ml-1.5 rounded bg-[var(--color-hover)] px-1 py-px text-[9px] uppercase tracking-wide text-[var(--color-text-faint)]">
                      {c.kind}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="lp-btn-keep"
                    aria-label={`Keep ${c.relativePath}`}
                    onClick={() => acceptChange(c.id)}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="lp-btn-undo"
                    aria-label={`Undo ${c.relativePath}`}
                    onClick={() => void rejectChange(c.id)}
                  >
                    Undo
                  </button>
                </div>
                {open && (
                  <pre className="max-h-36 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-[var(--font-mono)] text-[10px] leading-relaxed">
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
      )}
    </div>
  )
}
