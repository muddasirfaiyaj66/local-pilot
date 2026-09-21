import { WarningCircle } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import logoMark from '../assets/logo-mark.svg'

const EXAMPLES = [
  'What can you do in Phase 1?',
  'Help me connect Ollama',
  'Draft a concise PR description'
]

export function MessageList(): React.JSX.Element {
  const messages = useAppStore((s) => s.messages)
  const streamingText = useAppStore((s) => s.streamingText)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const error = useAppStore((s) => s.error)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const setView = useAppStore((s) => s.setView)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const showEmptyHint = messages.length === 0 && !isStreaming

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-36 pt-4" aria-live="polite">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        {showEmptyHint && (
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <img src={logoMark} alt="LocalPilot" width={56} height={56} className="rounded-[12px]" />
            <h2 className="mt-4 text-[18px] font-medium tracking-tight text-[var(--color-text)]">
              LocalPilot
            </h2>
            <p className="mt-2 max-w-sm text-[13px] text-[var(--color-text-muted)]">
              Your local desktop AI agent. Phase 1 is streaming chat with your models — browser,
              files, and screen control arrive next.
            </p>
            <div className="mt-6 flex max-w-md flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void sendMessage(ex)}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <article key={m.id} className="flex gap-3">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                m.role === 'user'
                  ? 'bg-[var(--color-hover)] text-[var(--color-text-muted)]'
                  : 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
              }`}
              aria-hidden
            >
              {m.role === 'user' ? 'Y' : 'L'}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="mb-1 text-[12px] font-medium text-[var(--color-text)]">
                {m.role === 'user' ? 'You' : 'LocalPilot'}
              </div>
              <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-[var(--color-text)]">
                {m.content}
              </div>
            </div>
          </article>
        ))}

        {isStreaming && (
          <article className="flex gap-3" aria-busy="true">
            <div
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-[var(--color-on-accent)]"
              aria-hidden
            >
              L
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-[var(--color-text)]">
                LocalPilot
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] motion-safe:animate-pulse" />
              </div>
              <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.6]">
                {streamingText || (
                  <span className="text-[var(--color-text-muted)]">Thinking…</span>
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
            <WarningCircle size={16} weight="fill" className="mt-0.5 text-[var(--color-danger)]" aria-hidden />
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
