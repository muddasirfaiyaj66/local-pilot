import { CaretRight, CheckCircle, CircleNotch, Wrench, XCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import type { TimelineEntry } from '../store/appStore'

interface AgentActivityProps {
  timeline: TimelineEntry[]
  streamingText: string
  isStreaming: boolean
  busyLabel: string
}

/** Cursor-like collapsible thought + tool exploration blocks */
export function AgentActivity({
  timeline,
  streamingText,
  isStreaming,
  busyLabel
}: AgentActivityProps): React.JSX.Element | null {
  const tools = timeline.filter((e) => e.kind === 'tool' || e.kind === 'result')
  const hasThought = Boolean(streamingText.trim())
  const showBusy = isStreaming && !hasThought
  const [openTools, setOpenTools] = useState(true)
  const [openThought, setOpenThought] = useState(true)

  if (!isStreaming && tools.length === 0) return null

  const toolPairs = pairTools(timeline)
  const toolSummary =
    toolPairs.length === 0
      ? null
      : toolPairs.length === 1
        ? toolPairs[0]!.name
        : `Explored ${toolPairs.length} tools`

  return (
    <div className="flex flex-col gap-1.5 lp-msg-enter">
      {(hasThought || showBusy) && (
        <div className="lp-agent-block">
          <button
            type="button"
            className="lp-agent-block-head"
            onClick={() => setOpenThought((v) => !v)}
            aria-expanded={openThought}
          >
            <CaretRight
              size={11}
              className={`shrink-0 text-[var(--color-text-faint)] transition-transform duration-150 ${openThought ? 'rotate-90' : ''}`}
              aria-hidden
            />
            {isStreaming && !hasThought ? (
              <CircleNotch size={12} className="text-[var(--color-accent)] motion-safe:animate-spin" aria-hidden />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
            )}
            <span className="text-[12px] font-medium text-[var(--color-text-muted)]">
              {hasThought ? 'Thought' : busyLabel}
            </span>
          </button>
          {openThought && hasThought && (
            <div className="lp-agent-block-body whitespace-pre-wrap break-words text-[12.5px] leading-[1.55] text-[var(--color-text-muted)]">
              {streamingText}
            </div>
          )}
        </div>
      )}

      {toolPairs.length > 0 && (
        <div className="lp-agent-block">
          <button
            type="button"
            className="lp-agent-block-head"
            onClick={() => setOpenTools((v) => !v)}
            aria-expanded={openTools}
          >
            <CaretRight
              size={11}
              className={`shrink-0 text-[var(--color-text-faint)] transition-transform duration-150 ${openTools ? 'rotate-90' : ''}`}
              aria-hidden
            />
            <Wrench size={12} className="text-[var(--color-text-faint)]" aria-hidden />
            <span className="truncate text-[12px] font-medium text-[var(--color-text-muted)]">
              {toolSummary}
            </span>
          </button>
          {openTools && (
            <ul className="lp-agent-block-body space-y-0.5">
              {toolPairs.map((t) => (
                <li key={t.id} className="lp-tool-pill">
                  {t.ok === false ? (
                    <XCircle size={12} className="shrink-0 text-[var(--color-danger)]" aria-hidden />
                  ) : t.ok === true ? (
                    <CheckCircle size={12} className="shrink-0 text-[var(--color-ok)]" aria-hidden />
                  ) : (
                    <CircleNotch
                      size={12}
                      className="shrink-0 text-[var(--color-accent)] motion-safe:animate-spin"
                      aria-hidden
                    />
                  )}
                  <span className="truncate font-[var(--font-mono)] text-[11px] text-[var(--color-text)]">
                    {t.name}
                  </span>
                  {t.detail ? (
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text-faint)]">
                      {t.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function pairTools(
  timeline: TimelineEntry[]
): Array<{ id: string; name: string; detail?: string; ok?: boolean }> {
  const out: Array<{ id: string; name: string; detail?: string; ok?: boolean }> = []
  for (const e of timeline) {
    if (e.kind === 'tool') {
      const name = e.text.replace(/\s*\(.*\)$/, '').trim() || e.text
      out.push({ id: e.id, name, detail: e.text.includes('(') ? e.text : undefined })
    } else if (e.kind === 'result' && out.length > 0) {
      const last = out[out.length - 1]!
      last.ok = e.ok
      last.detail = e.text
    }
  }
  return out.slice(-24)
}
