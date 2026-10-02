import {
  ArrowClockwise,
  ArrowSquareOut,
  Browser,
  ListBullets,
  Monitor,
  Stop
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAppStore, type VisionClick, type VisionFrame } from '../store/appStore'
import type { WorkspaceTreeNode } from '@shared/ipc'

type Tab = 'app' | 'screen' | 'log' | 'files'

export function LivePreviewPane(): React.JSX.Element {
  const timeline = useAppStore((s) => s.timeline)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const settings = useAppStore((s) => s.settings)
  const previewUrl = useAppStore((s) => s.previewUrl)
  const processes = useAppStore((s) => s.processes)
  const refreshProcesses = useAppStore((s) => s.refreshProcesses)
  const stopProcess = useAppStore((s) => s.stopProcess)
  const setPreviewUrl = useAppStore((s) => s.setPreviewUrl)
  const running = processes.filter((p) => p.running)
  const [tab, setTab] = useState<Tab>('screen')
  const [frameKey, setFrameKey] = useState(0)
  const [preview, setPreview] = useState<{ dataUrl: string; width: number; height: number } | null>(
    null
  )
  const [previewError, setPreviewError] = useState<string | null>(null)
  const visionFrame = useAppStore((s) => s.visionFrame)
  const visionClick = useAppStore((s) => s.visionClick)
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([])
  const workspace = settings?.workspacePath?.trim()
  const folderName = workspace
    ? workspace.replace(/\\/g, '/').split('/').filter(Boolean).pop()
    : null

  useEffect(() => {
    if (tab !== 'files' || !workspace) return
    void window.localpilot.workspaceTree().then(setTree).catch(() => setTree([]))
  }, [tab, workspace])

  // Jump to the app as soon as a dev server URL shows up.
  useEffect(() => {
    if (previewUrl) setTab('app')
  }, [previewUrl])

  // Keep the server list honest while a run is in flight.
  useEffect(() => {
    if (!isStreaming) return
    const id = window.setInterval(() => void refreshProcesses(), 3000)
    return () => window.clearInterval(id)
  }, [isStreaming, refreshProcesses])

  useEffect(() => {
    if (tab !== 'screen') return
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
  }, [isStreaming, tab])

  return (
    <aside className="lp-context-pane" aria-label="Context">
      <div className="lp-context-tabs">
        <button
          type="button"
          className={tab === 'app' ? 'lp-context-tab is-active' : 'lp-context-tab'}
          onClick={() => setTab('app')}
        >
          <Browser size={12} aria-hidden />
          App
          {previewUrl ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" aria-hidden />
          ) : null}
        </button>
        <button
          type="button"
          className={tab === 'screen' ? 'lp-context-tab is-active' : 'lp-context-tab'}
          onClick={() => setTab('screen')}
        >
          <Monitor size={12} aria-hidden />
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
        <button
          type="button"
          className={tab === 'files' ? 'lp-context-tab is-active' : 'lp-context-tab'}
          onClick={() => setTab('files')}
        >
          Files
        </button>
        <div className="flex-1" />
        {folderName ? (
          <span
            className="max-w-[80px] truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]"
            title={workspace}
          >
            {folderName}
          </span>
        ) : null}
      </div>

      {tab === 'app' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {running.length > 0 && (
            <ul className="shrink-0 border-b border-[var(--color-border)] p-1.5">
              {running.map((p) => (
                <li key={p.id} className="lp-tool-pill">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ok)]"
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-[var(--font-mono)] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    title={`${p.command} — ${p.cwd}`}
                    onClick={() => p.url && setPreviewUrl(p.url)}
                  >
                    {p.url ? p.url.replace(/^https?:\/\//, '') : p.command}
                  </button>
                  <button
                    type="button"
                    className="lp-icon-btn !h-5 !w-5"
                    title={`Stop ${p.command}`}
                    aria-label={`Stop ${p.command}`}
                    onClick={() => void stopProcess(p.id)}
                  >
                    <Stop size={10} weight="fill" className="text-[var(--color-danger)]" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {previewUrl ? (
            <>
              <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
                <span
                  className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-muted)]"
                  title={previewUrl}
                >
                  {previewUrl}
                </span>
                <button
                  type="button"
                  className="lp-icon-btn !h-6 !w-6"
                  title="Reload preview"
                  aria-label="Reload preview"
                  onClick={() => setFrameKey((k) => k + 1)}
                >
                  <ArrowClockwise size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  className="lp-icon-btn !h-6 !w-6"
                  title="Open in browser"
                  aria-label="Open in browser"
                  onClick={() => void window.localpilot.openExternal(previewUrl)}
                >
                  <ArrowSquareOut size={12} aria-hidden />
                </button>
              </div>
              <iframe
                key={frameKey}
                src={previewUrl}
                title="App preview"
                className="min-h-0 flex-1 border-0 bg-white"
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] leading-relaxed text-[var(--color-text-faint)]">
              {running.length > 0
                ? 'Select a server above to preview it.'
                : 'Ask the agent to run the app. A dev server started in the background appears here.'}
            </div>
          )}
        </div>
      ) : tab === 'screen' ? (
        <div className="flex min-h-0 flex-1 flex-col p-2.5">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
            {visionFrame || preview ? (
              <>
                <img
                  src={(visionFrame ?? preview)!.dataUrl}
                  alt={visionFrame ? 'Frame sent to the model' : 'Screen preview'}
                  className="h-full w-full object-contain"
                />
                <ClickCrosshair frame={visionFrame} click={visionClick} />
              </>
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
      ) : tab === 'files' ? (
        <ul className="min-h-0 flex-1 overflow-y-auto p-2 font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)]">
          {tree.length === 0 ? (
            <li className="px-1 py-3 text-[var(--color-text-faint)]">Open a folder to see its files.</li>
          ) : (
            tree.map((node) => (
              <li key={node.name} className="mb-1">
                <div className="text-[var(--color-text)]">
                  {node.name}
                  {node.dir ? '/' : ''}
                </div>
                {node.children?.map((child) => (
                  <div key={child.name} className="pl-3 text-[var(--color-text-faint)]">
                    {child.name}
                    {child.dir ? '/' : ''}
                  </div>
                ))}
              </li>
            ))
          )}
        </ul>
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

function ClickCrosshair({
  frame,
  click
}: {
  frame: VisionFrame | null
  click: VisionClick | null
}): React.JSX.Element | null {
  if (!frame || !click) return null
  const width = click.imageWidth || frame.width
  const height = click.imageHeight || frame.height
  if (!width || !height) return null
  const left = `${Math.min(100, Math.max(0, (click.x / width) * 100))}%`
  const top = `${Math.min(100, Math.max(0, (click.y / height) * 100))}%`
  return (
    <span
      className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-accent)]"
      style={{ left, top }}
      title="Last click"
    />
  )
}
