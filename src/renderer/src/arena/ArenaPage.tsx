import { Crown, Lightning, PaperPlaneRight, Stop, Trophy, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatChunkEvent } from '@shared/ipc'
import { presetForProvider, TIER_LABEL } from '@shared/providerCatalog'
import { useAppStore } from '../store/appStore'
import { usePersistentState } from '../hooks/usePersistentState'
import { Markdown } from '../components/Markdown'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'

interface Lane {
  providerId: string
  requestId: string | null
  text: string
  status: 'idle' | 'running' | 'done' | 'error'
  error?: string
  startedAt: number
  firstTokenAt?: number
  finishedAt?: number
  completionTokens?: number
}

const MAX_LANES = 4

/** Send one prompt to several models at once and compare speed and answers. */
export function ArenaPage(): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const enabled = useMemo(() => providers.filter((p) => p.enabled), [providers])
  const [selected, setSelected] = usePersistentState<string[]>('lp.arena.selected', [])
  const [wins, setWins] = usePersistentState<Record<string, number>>('lp.arena.wins', {})
  const [system, setSystem] = usePersistentState('lp.arena.system', '')
  const [prompt, setPrompt] = useState('')
  const [lanes, setLanes] = useState<Lane[]>([])
  const [voted, setVoted] = useState(false)
  const lanesRef = useRef<Lane[]>([])
  lanesRef.current = lanes
  const pending = useRef<ChatChunkEvent[]>([])

  const chosen = selected.filter((id) => enabled.some((p) => p.id === id)).slice(0, MAX_LANES)
  const running = lanes.some((l) => l.status === 'running')

  /** Apply one chunk to the lane that owns its request id. */
  const applyChunk = useCallback((event: ChatChunkEvent): void => {
    const now = performance.now()
    setLanes((prev) =>
      prev.map((lane) => {
        if (lane.requestId !== event.requestId) return lane
        const { chunk } = event
        if (chunk.type === 'text') return { ...lane, text: lane.text + chunk.text, firstTokenAt: lane.firstTokenAt ?? now }
        if (chunk.type === 'usage') return { ...lane, completionTokens: chunk.completionTokens ?? lane.completionTokens }
        if (chunk.type === 'notice') return { ...lane, text: `${lane.text}\n\n> ${chunk.message}\n\n` }
        if (chunk.type === 'error') return { ...lane, status: 'error', error: chunk.message, finishedAt: now }
        if (chunk.type === 'done') return { ...lane, status: lane.status === 'error' ? 'error' : 'done', finishedAt: now }
        return lane
      })
    )
  }, [])

  useEffect(
    () =>
      window.localpilot.onChatChunk((event) => {
        if (lanesRef.current.some((l) => l.requestId === event.requestId)) {
          applyChunk(event)
          return
        }
        // startChat may not have resolved with the id yet; hold early chunks.
        pending.current.push(event)
        if (pending.current.length > 500) pending.current.splice(0, 250)
      }),
    [applyChunk]
  )

  const flushPending = (): void => {
    const keep: ChatChunkEvent[] = []
    for (const event of pending.current.splice(0)) {
      if (lanesRef.current.some((l) => l.requestId === event.requestId)) applyChunk(event)
      else keep.push(event)
    }
    pending.current = keep
  }

  const stopAll = useCallback((): void => {
    for (const lane of lanesRef.current) {
      if (lane.requestId && lane.status === 'running') void window.localpilot.abortChat(lane.requestId)
    }
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  const run = async (): Promise<void> => {
    const text = prompt.trim()
    if (!text || chosen.length === 0 || running) return
    setVoted(false)
    const start = performance.now()
    const initial: Lane[] = chosen.map((providerId) => ({ providerId, requestId: null, text: '', status: 'running', startedAt: start }))
    setLanes(initial)
    lanesRef.current = initial
    const messages = [
      ...(system.trim() ? [{ role: 'system' as const, content: system.trim() }] : []),
      { role: 'user' as const, content: text }
    ]
    await Promise.all(
      chosen.map(async (providerId, index) => {
        try {
          const { requestId } = await window.localpilot.startChat({ providerId, messages, stream: true })
          lanesRef.current = lanesRef.current.map((l, i) => (i === index ? { ...l, requestId } : l))
          setLanes(lanesRef.current)
          flushPending()
        } catch (err) {
          setLanes((prev) =>
            prev.map((l, i) =>
              i === index ? { ...l, status: 'error', error: err instanceof Error ? err.message : String(err), finishedAt: performance.now() } : l
            )
          )
        }
      })
    )
  }

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const current = prev.filter((p) => enabled.some((e) => e.id === p))
      if (current.includes(id)) return current.filter((p) => p !== id)
      return current.length >= MAX_LANES ? current : [...current, id]
    })
  }

  const vote = (providerId: string): void => {
    const provider = providers.find((p) => p.id === providerId)
    if (!provider || voted) return
    const key = `${provider.name} · ${provider.model}`
    setWins((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
    setVoted(true)
  }

  const leaderboard = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const allDone = lanes.length > 0 && lanes.every((l) => l.status !== 'running')
  const fastest = allDone
    ? lanes.filter((l) => l.status === 'done' && l.finishedAt).sort((a, b) => a.finishedAt! - b.finishedAt!)[0]?.providerId
    : undefined

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] px-6 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <Lightning size={18} weight="fill" className="text-[var(--color-accent)]" aria-hidden />
          <h1 className="text-[16px] font-medium tracking-tight">Model Arena</h1>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            One prompt, up to {MAX_LANES} models, side by side.
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Models to compare">
          {enabled.map((p) => {
            const on = chosen.includes(p.id)
            const preset = presetForProvider(p)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={!on && chosen.length >= MAX_LANES}
                onClick={() => toggle(p.id)}
                className={`lp-model-chip ${on ? 'is-on' : ''}`}
                title={`${p.name} · ${p.model}`}
              >
                <span className="truncate">{p.name}</span>
                <span className="truncate font-[var(--font-mono)] text-[10px] opacity-70">{p.model}</span>
                {preset ? <span className="text-[9px] uppercase tracking-wide opacity-60">{TIER_LABEL[preset.tier]}</span> : null}
              </button>
            )
          })}
          {enabled.length === 0 ? (
            <span className="text-[12px] text-[var(--color-text-faint)]">Enable providers in Settings to compare them.</span>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {lanes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div className="max-w-sm">
                <Trophy size={32} weight="duotone" className="mx-auto mb-3 text-[var(--color-accent)]" aria-hidden />
                <p className="text-[13px] text-[var(--color-text-muted)]">
                  Pick models above, write a prompt, and compare speed (time to first token, total time, throughput) and quality.
                  Vote for the best answer to build your own leaderboard.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-px bg-[var(--color-border)]" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}>
              {lanes.map((lane) => {
                const provider = providers.find((p) => p.id === lane.providerId)
                const ttft = lane.firstTokenAt ? lane.firstTokenAt - lane.startedAt : null
                const total = lane.finishedAt ? lane.finishedAt - lane.startedAt : null
                const tokens = lane.completionTokens ?? Math.ceil(lane.text.length / 4)
                const genMs = lane.finishedAt && lane.firstTokenAt ? lane.finishedAt - lane.firstTokenAt : null
                const tps = genMs && genMs > 0 ? (tokens / genMs) * 1000 : null
                return (
                  <section key={lane.providerId} className="flex min-h-0 flex-col bg-[var(--color-bg)]" aria-label={provider?.name}>
                    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-medium">{provider?.name ?? lane.providerId}</span>
                          {fastest === lane.providerId ? <Badge tone="accent">fastest</Badge> : null}
                        </div>
                        <div className="truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">{provider?.model}</div>
                      </div>
                      {lane.status === 'running' ? <Spinner size={12} /> : null}
                      {allDone && lane.status === 'done' ? (
                        <button
                          type="button"
                          className={`lp-btn lp-btn-sm ${voted ? 'lp-btn-quiet' : 'lp-btn-ghost'}`}
                          disabled={voted}
                          onClick={() => vote(lane.providerId)}
                          title="Best answer"
                        >
                          <Crown size={12} aria-hidden /> Best
                        </button>
                      ) : null}
                    </div>
                    <div className="flex gap-3 border-b border-[var(--color-border)] px-3 py-1 font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                      <span title="Time to first token">TTFT {ttft != null ? `${Math.round(ttft)}ms` : '—'}</span>
                      <span title="Total time">total {total != null ? `${(total / 1000).toFixed(1)}s` : '—'}</span>
                      <span title="Output tokens per second">{tps != null ? `${tps.toFixed(0)} tok/s` : '— tok/s'}</span>
                      <span className="ml-auto">{tokens} tok</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[13px]">
                      {lane.status === 'error' ? (
                        <p className="text-[12px] text-[var(--color-danger)]">{lane.error}</p>
                      ) : lane.text ? (
                        <Markdown text={lane.text} />
                      ) : (
                        <p className="text-[12px] text-[var(--color-text-faint)]">Waiting for first token…</p>
                      )}
                    </div>
                    {allDone && lane.status === 'done' ? (
                      <div className="border-t border-[var(--color-border)] px-3 py-1.5">
                        <button type="button" className="text-[11px] text-[var(--color-accent)] hover:underline" onClick={() => void setActiveProvider(lane.providerId)}>
                          Use as active model
                        </button>
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}

          <div className="border-t border-[var(--color-border)] p-3">
            <details className="mb-2">
              <summary className="text-[11px] text-[var(--color-text-faint)]">System prompt (optional)</summary>
              <textarea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                rows={2}
                className="lp-input mt-1.5 resize-none text-[12px]"
                placeholder="You are a concise senior engineer…"
              />
            </details>
            <div className="lp-composer flex items-end gap-2 !p-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void run()
                  }
                }}
                rows={2}
                placeholder={chosen.length === 0 ? 'Select at least one model above…' : `Ask ${chosen.length} model${chosen.length > 1 ? 's' : ''}…`}
                aria-label="Arena prompt"
                className="min-h-[44px] flex-1 resize-none bg-transparent px-1 text-[13px] outline-none placeholder:text-[var(--color-text-faint)]"
              />
              {running ? (
                <button type="button" className="lp-btn lp-btn-danger" onClick={stopAll}>
                  <Stop size={13} weight="fill" aria-hidden /> Stop
                </button>
              ) : (
                <button type="button" className="lp-btn lp-btn-accent" disabled={!prompt.trim() || chosen.length === 0} onClick={() => void run()}>
                  <PaperPlaneRight size={13} weight="fill" aria-hidden /> Compare
                </button>
              )}
            </div>
          </div>
        </div>

        {leaderboard.length > 0 ? (
          <aside className="hidden w-56 shrink-0 border-l border-[var(--color-border)] p-3 xl:block" aria-label="Leaderboard">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">Your leaderboard</span>
              <button type="button" className="lp-mini-btn" aria-label="Reset leaderboard" title="Reset" onClick={() => setWins({})}>
                <X size={11} />
              </button>
            </div>
            <ol className="space-y-1">
              {leaderboard.map(([name, count], i) => (
                <li key={name} className="flex items-center gap-2 text-[12px]">
                  <span className="w-4 text-right font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]" title={name}>
                    {name}
                  </span>
                  <span className="font-[var(--font-mono)] text-[11px] text-[var(--color-accent)]">{count}</span>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
