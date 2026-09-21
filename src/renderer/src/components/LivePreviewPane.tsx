import { Browser, ListBullets } from '@phosphor-icons/react'

export function LivePreviewPane(): React.JSX.Element {
  return (
    <aside
      className="flex w-[260px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label="Context"
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-[var(--color-border)] px-3">
        <Browser size={14} className="text-[var(--color-text-faint)]" aria-hidden />
        <span className="text-[12px] text-[var(--color-text-muted)]">Live view</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-bg)]">
          <span className="px-3 text-center text-[11px] leading-snug text-[var(--color-text-faint)]">
            Browser / screen preview
            <br />
            Phases 3–4
          </span>
        </div>
      </div>
      <div className="border-t border-[var(--color-border)] px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <ListBullets size={14} className="text-[var(--color-text-faint)]" aria-hidden />
          <span className="text-[12px] text-[var(--color-text-muted)]">Timeline</span>
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)]">Tool steps in Phase 2</p>
      </div>
    </aside>
  )
}
