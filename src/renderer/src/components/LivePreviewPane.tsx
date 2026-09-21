import { Browser, ListBullets } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

export function LivePreviewPane(): React.JSX.Element {
  const timeline = useAppStore((s) => s.timeline)
  const plan = useAppStore((s) => s.plan)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const [preview, setPreview] = useState<{ dataUrl: string; width: number; height: number } | null>(
    null
  )
  const [previewError, setPreviewError] = useState<string | null>(null)
  const lastClick = [...timeline].reverse().find((e) => e.kind === 'tool' && e.text.includes('screen_click'))

  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const result = await window.localpilot.getScreenPreview()
        if (cancelled) return
        if (result.ok && result.dataUrl && result.width && result.height) {
          setPreview({ dataUrl: result.dataUrl, width: result.width, height: result.height })
          setPreviewError(null)
        } else {
          setPreviewError(result.error ?? 'Preview unavailable')
        }
      } catch (err) {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : String(err))
      }
    }
    void tick()
    const id = window.setInterval(() => {
      if (isStreaming) void tick()
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [isStreaming])

  return (
    <aside
      className="flex w-[260px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label="Context"
    >
      <div className="flex h-8 items-center justify-between border-b border-[var(--color-border)] px-2.5">
        <div className="flex items-center gap-1.5">
          <Browser size={13} className="text-[var(--color-text-faint)]" aria-hidden />
          <span className="text-[11px] text-[var(--color-text-muted)]">Live view</span>
        </div>
        <button
          type="button"
          className="text-[11px] text-[var(--color-accent)] hover:underline"
          onClick={() => {
            void window.localpilot.getScreenPreview().then((result) => {
              if (result.ok && result.dataUrl && result.width && result.height) {
                setPreview({
                  dataUrl: result.dataUrl,
                  width: result.width,
                  height: result.height
                })
              }
            })
          }}
        >
          Refresh
        </button>
      </div>
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] p-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
          {preview ? (
            <img
              src={preview.dataUrl}
              alt="Screen preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-[var(--color-text-faint)]">
              {previewError ?? 'Screen preview — grant OS permissions if prompted'}
            </div>
          )}
          {lastClick && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/20"
              title={lastClick.text}
            />
          )}
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
      <div className="flex min-h-0 flex-1 flex-col px-2.5 py-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <ListBullets size={13} className="text-[var(--color-text-faint)]" aria-hidden />
          <span className="text-[11px] text-[var(--color-text-muted)]">Action timeline</span>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto text-[11px]">
          {timeline.length === 0 && (
            <li className="text-[var(--color-text-faint)]">Tool steps appear while the agent runs.</li>
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
