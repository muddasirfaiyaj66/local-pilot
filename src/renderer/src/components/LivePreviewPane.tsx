import { Browser, ListBullets } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'

export function LivePreviewPane(): React.JSX.Element {
  const timeline = useAppStore((s) => s.timeline)
  const plan = useAppStore((s) => s.plan)

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label="Context"
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-[var(--color-border)] px-3">
        <Browser size={14} className="text-[var(--color-text-faint)]" aria-hidden />
        <span className="text-[12px] text-[var(--color-text-muted)]">Live view</span>
      </div>
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] p-3">
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-bg)]">
          <span className="px-3 text-center text-[11px] leading-snug text-[var(--color-text-faint)]">
            Browser / screen preview
            <br />
            Phases 3–4
          </span>
        </div>
        {plan && (
          <div>
            <div className="mb-1 text-[11px] text-[var(--color-text-faint)]">Plan</div>
            <ol className="space-y-1 text-[11px] text-[var(--color-text-muted)]">
              {plan.steps.map((s, i) => (
                <li key={s.id} className="truncate">
                  {i + 1}. {s.title}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <ListBullets size={14} className="text-[var(--color-text-faint)]" aria-hidden />
          <span className="text-[12px] text-[var(--color-text-muted)]">Action timeline</span>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto text-[11px]">
          {timeline.length === 0 && (
            <li className="text-[var(--color-text-faint)]">Tool steps appear here while the agent runs.</li>
          )}
          {timeline.map((e) => (
            <li
              key={e.id}
              className={`rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 ${
                e.ok === false ? 'border-[var(--color-danger)]/40' : ''
              }`}
            >
              <div className="text-[10px] uppercase text-[var(--color-text-faint)]">{e.kind}</div>
              <div className="mt-0.5 line-clamp-3 text-[var(--color-text-muted)]">{e.text}</div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
