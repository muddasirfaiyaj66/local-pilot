import { FolderOpen, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
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
    ? 'Waiting for your approval…'
    : lastTimeline?.kind === 'tool'
      ? `Running ${lastTimeline.text.split(' ')[0] ?? 'tool'}…`
      : lastTimeline?.kind === 'result'
        ? 'Waiting for model…'
        : 'Waiting for model…'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, plan])

  const showEmptyHint = messages.length === 0 && !isStreaming

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-3" aria-live="polite">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        {showEmptyHint && (
          <div className="flex flex-col items-center px-4 py-20 text-center lp-msg-enter">
            <img
              src={logoMark}
              alt=""
              width={40}
              height={40}
              className="rounded-[9px] opacity-90"
            />
            <h2 className="mt-5 text-[15px] font-medium tracking-tight text-[var(--color-text)]">
              LocalPilot
            </h2>
            <p className="mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              {hasWorkspace
                ? 'Ask a question, plan a change, or hand the agent a goal.'
                : 'Open a project folder to enable Agent and Plan tools.'}
            </p>
            {!hasWorkspace && (
              <button
                type="button"
                onClick={() => void openWorkspace()}
                className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-2)]"
              >
                <FolderOpen size={14} aria-hidden />
                Open Folder
              </button>
            )}
          </div>
        )}

        {plan && plan.steps.length > 0 && (
          <section
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 lp-msg-enter"
            aria-label="Plan"
          >
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-faint)]">
              Plan
            </div>
            <ol className="space-y-1.5">
              {plan.steps.map((step, i) => (
                <li
                  key={step.id}
                  className="flex gap-2 text-[12px] text-[var(--color-text-muted)]"
                >
                  <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                    {i + 1}.
                  </span>
                  <span className="text-[var(--color-text)]">{step.title}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {messages.map((m) => (
          <article key={m.id} className="flex gap-3 lp-msg-enter">
            <div
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-semibold ${
                m.role === 'user'
                  ? 'bg-[var(--color-hover)] text-[var(--color-text-muted)]'
                  : 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
              }`}
              aria-hidden
            >
              {m.role === 'user' ? 'Y' : 'L'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                {m.role === 'user' ? 'You' : 'LocalPilot'}
              </div>
              {m.images && m.images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.images.map((img, i) => (
                    <img
                      key={i}
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt="Attachment"
                      className="max-h-36 rounded-md border border-[var(--color-border)]"
                    />
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.65] text-[var(--color-text)]">
                {m.content}
              </div>
            </div>
          </article>
        ))}

        {isStreaming && (
          <article className="flex gap-3" aria-busy="true">
            <div
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--color-accent)] text-[9px] font-semibold text-[var(--color-on-accent)]"
              aria-hidden
            >
              L
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-[var(--color-text-muted)]">
                LocalPilot
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] motion-safe:animate-pulse" />
              </div>
              <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.65]">
                {streamingText || (
                  <span className="text-[var(--color-text-muted)]">{agentBusyLabel}</span>
                )}
              </div>
            </div>
          </article>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/40 bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-3 py-2.5 text-[13px]"
          >
            <WarningCircle
              size={16}
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
