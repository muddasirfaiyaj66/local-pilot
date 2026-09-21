import { Browser, ListBullets } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

export function LivePreviewPane(): React.JSX.Element {
  const timeline = useAppStore((s) => s.timeline)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const settings = useAppStore((s) => s.settings)
  const [tab, setTab] = useState<'screen' | 'log'>('screen')
  const [preview, setPreview] = useState<{ dataUrl: string; width: number; height: number } | null>(
    null
  )
  const [previewError, setPreviewError] = useState<string | null>(null)
  const workspace = settings?.workspacePath?.trim()
  const folderName = workspace
    ? workspace.replace(/\\/g, '/').split('/').filter(Boolean).pop()
    : null

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
    <aside className="lp-context-pane" aria-label="Context">
      <div className="lp-context-tabs">
        <button
          type="button"
          className={tab === 'screen' ? 'lp-context-tab is-active' : 'lp-context-tab'}
          onClick={() => setTab('screen')}
        >
          <Browser size={12} aria-hidden />
          Screen
        </button>
        <button
          type="button"
          className={tab === 'log' ? 'lp-context-tab is-active' : 'lp-context-tab'}
          onClick={() => setTab('log')}
        >
          <ListBullets size={12} aria-hidden />
          Log
        </button>
        <div className="flex-1" />
        {folderName ? (
          <span className="max-w-[100px] truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]" title={workspace}>
            {folderName}
          </span>
        ) : null}
      </div>

      {tab === 'screen' ? (
        <div className="flex min-h-0 flex-1 flex-col p-2.5">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
            {preview ? (
              <img
                src={preview.dataUrl}
                alt="Screen preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full min-h-[140px] items-center justify-center px-3 text-center text-[11px] text-[var(--color-text-faint)]">
                {previewError ?? 'Screen preview'}
              </div>
            )}
          </div>
          <button
            type="button"
            className="mt-2 self-end text-[11px] text-[var(--color-accent)] hover:underline"
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
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {timeline.length === 0 && (
            <li className="px-1.5 py-3 text-[11px] text-[var(--color-text-faint)]">
              Tool activity appears here while the agent runs.
            </li>
          )}
          {timeline.map((e) => (
            <li key={e.id} className="lp-tool-pill">
              <span className="w-10 shrink-0 text-[9px] uppercase tracking-wide text-[var(--color-text-faint)]">
                {e.kind}
              </span>
              <span className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)]">
                {e.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
