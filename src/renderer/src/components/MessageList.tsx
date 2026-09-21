import { FolderOpen, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { AgentActivity } from './AgentActivity'
import { Markdown } from './Markdown'
import logoMark from '../assets/logo-mark.svg'

export function MessageList(): React.JSX.Element {
  const messages = useAppStore((s) => s.messages)
  const streamingText = useAppStore((s) => s.streamingText)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const error = useAppStore((s) => s.error)
  const setView = useAppStore((s) => s.setView)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const plan = useAppStore((s) => s.plan)
  const settings = useAppStore((s) => s.settings)
  const pendingPermission = useAppStore((s) => s.pendingPermission)
  const timeline = useAppStore((s) => s.timeline)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasWorkspace = Boolean(settings?.workspacePath?.trim())

  const lastTimeline = timeline[timeline.length - 1]
  const agentBusyLabel = pendingPermission
    ? 'Waiting for approval'
    : lastTimeline?.kind === 'tool'
      ? `Running ${lastTimeline.text.split(' ')[0] ?? 'tool'}`
      : 'Thinking'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, plan, timeline])

  const showEmptyHint = messages.length === 0 && !isStreaming && timeline.length === 0

  return (
    <div className="lp-transcript" aria-live="polite">
      <div className="lp-transcript-inner">
        {showEmptyHint && (
          <div className="flex flex-col items-center px-4 py-24 text-center lp-msg-enter">
            <img src={logoMark} alt="" width={36} height={36} className="rounded-[8px] opacity-90" />
            <h2 className="mt-4 text-[14px] font-medium tracking-tight text-[var(--color-text)]">
              LocalPilot
            </h2>
            <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              {hasWorkspace
                ? 'Describe a goal. Agent plans, edits files, and shows diffs to keep or undo.'
                : 'Open a project folder to enable Agent and Plan.'}
            </p>
            {!hasWorkspace && (
              <button
                type="button"
                onClick={() => void openWorkspace()}
                className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-2)]"
              >
                <FolderOpen size={14} aria-hidden />
                Open Folder
              </button>
            )}
          </div>
        )}

        {plan && plan.steps.length > 0 && (
          <details className="lp-plan" open>
            <summary className="lp-plan-summary">
              Plan
              <span className="ml-1.5 font-[var(--font-mono)] text-[10px] font-normal text-[var(--color-text-faint)]">
                {plan.steps.length}
              </span>
            </summary>
            <ol className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
              {plan.steps.map((step, i) => (
                <li key={step.id} className="flex gap-2 text-[12px] text-[var(--color-text-muted)]">
                  <span className="w-4 shrink-0 font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                    {i + 1}.
                  </span>
                  <span className="text-[var(--color-text)]">{step.title}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <article key={m.id} className="lp-user-msg lp-msg-enter">
              {m.images && m.images.length > 0 && (
                <div className="mb-2 flex flex-wrap justify-end gap-2">
                  {m.images.map((img, i) => (
                    <img
                      key={i}
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt=""
                      className="max-h-32 rounded-md border border-[var(--color-border)]"
                    />
                  ))}
                </div>
              )}
              <div className="lp-user-bubble">{m.content}</div>
            </article>
          ) : (
            <article key={m.id} className="lp-assistant-msg lp-msg-enter">
              <div className="mb-1 text-[11px] font-medium text-[var(--color-text-faint)]">
                LocalPilot
              </div>
              <Markdown text={m.content} />
            </article>
          )
        )}

        <AgentActivity
          timeline={timeline}
          streamingText={streamingText}
          isStreaming={isStreaming}
          busyLabel={agentBusyLabel}
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/35 bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] px-3 py-2.5 text-[12px]"
          >
            <WarningCircle
              size={15}
              weight="fill"
              className="mt-0.5 text-[var(--color-danger)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--color-text)]">Something went wrong</div>
              <div className="mt-0.5 text-[var(--color-text-muted)]">{error}</div>
              <button
                type="button"
                className="mt-2 text-[12px] text-[var(--color-accent)] hover:underline"
                onClick={() => setView('settings')}
              >
                Open settings
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
