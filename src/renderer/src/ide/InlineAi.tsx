import { DiffEditor } from '@monaco-editor/react'
import { ArrowClockwise, Check, Sparkle, Stop, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Spinner } from '../components/ui/Spinner'
import { extractCode } from './codeUtils'

export interface InlineTarget {
  path: string
  language: string
  /** Full model text when the request started. */
  fullText: string
  /** Character offsets of the region being rewritten. */
  start: number
  end: number
  /** Pre-filled instruction (plugin inline commands). */
  instruction?: string
  autoRun?: boolean
}

type Phase = 'prompt' | 'streaming' | 'review' | 'error'

const SYSTEM = [
  'You are a precise code editor embedded in an IDE.',
  'Rewrite ONLY the code in <selection> according to the instruction.',
  'Reply with the replacement code in a single fenced code block and nothing else.',
  'Keep the original indentation, style, and language. Do not add explanations.'
].join(' ')

function buildPrompt(target: InlineTarget, instruction: string): string {
  const before = target.fullText.slice(Math.max(0, target.start - 3000), target.start)
  const selection = target.fullText.slice(target.start, target.end)
  const after = target.fullText.slice(target.end, target.end + 1500)
  return [
    `File: ${target.path} (${target.language})`,
    `<context_before>\n${before}\n</context_before>`,
    `<selection>\n${selection}\n</selection>`,
    `<context_after>\n${after}\n</context_after>`,
    `Instruction: ${instruction}`
  ].join('\n\n')
}

/**
 * Inline AI rewrite: prompt bar → streamed proposal → side-by-side diff →
 * Accept (applied as one undoable edit) or Reject.
 */
export function InlineAi({
  target,
  theme,
  onAccept,
  onClose
}: {
  target: InlineTarget
  theme: string
  onAccept: (replacement: string) => void
  onClose: () => void
}): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const activeProviderId = useAppStore((s) => s.settings?.activeProviderId ?? null)
  const provider = providers.find((p) => p.id === activeProviderId)
  const [instruction, setInstruction] = useState(target.instruction ?? '')
  const [phase, setPhase] = useState<Phase>('prompt')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const original = target.fullText.slice(target.start, target.end)
  const proposal = extractCode(reply)
  const modified = target.fullText.slice(0, target.start) + proposal + target.fullText.slice(target.end)

  const stop = useCallback((): void => {
    if (requestRef.current) void window.localpilot.abortChat(requestRef.current)
    requestRef.current = null
  }, [])

  useEffect(() => () => stop(), [stop])

  const run = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return
      if (!provider) {
        setError('No active model — pick one in the chat model menu or Settings.')
        setPhase('error')
        return
      }
      stop()
      setReply('')
      setError(null)
      setPhase('streaming')
      let buffer = ''
      let requestId: string | null = null
      const pending: Array<Parameters<Parameters<typeof window.localpilot.onChatChunk>[0]>[0]> = []
      const handle = (event: (typeof pending)[number]): void => {
        const { chunk } = event
        if (chunk.type === 'text') {
          buffer += chunk.text
          setReply(buffer)
        } else if (chunk.type === 'error') {
          setError(chunk.message)
          setPhase('error')
          off()
        } else if (chunk.type === 'done') {
          requestRef.current = null
          setPhase(buffer.trim() ? 'review' : 'error')
          if (!buffer.trim()) setError('The model returned nothing.')
          off()
        }
      }
      // Chunks can arrive before startChat resolves with the id; buffer them.
      const off = window.localpilot.onChatChunk((event) => {
        if (requestId === null) pending.push(event)
        else if (event.requestId === requestId) handle(event)
      })
      try {
        const started = await window.localpilot.startChat({
          providerId: provider.id,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: buildPrompt(target, text) }
          ]
        })
        requestId = started.requestId
        requestRef.current = started.requestId
        for (const event of pending.splice(0)) if (event.requestId === requestId) handle(event)
      } catch (err) {
        off()
        setError(err instanceof Error ? err.message : String(err))
        setPhase('error')
      }
    },
    [provider, stop, target]
  )

  useEffect(() => {
    if (target.autoRun && target.instruction) void run(target.instruction)
    else inputRef.current?.focus()
    // Only when a new target opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const accept = useCallback((): void => {
    if (phase !== 'review') return
    onAccept(proposal)
  }, [phase, proposal, onAccept])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        stop()
        onClose()
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && phase === 'review') {
        event.preventDefault()
        accept()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase, accept, onClose, stop])

  const lines = original.split('\n').length

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[color-mix(in_oklab,var(--color-bg)_70%,transparent)] backdrop-blur-[1px]">
      <div className="lp-inline-ai">
        <Sparkle size={15} weight="fill" className="shrink-0 text-[var(--color-accent)]" aria-hidden />
        <input
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              void run(instruction)
            } else if (e.key === 'Escape') {
              stop()
              onClose()
            }
          }}
          placeholder={`Edit ${lines} line${lines > 1 ? 's' : ''} with AI — e.g. "add error handling", "convert to async/await"`}
          aria-label="AI edit instruction"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
        <span className="hidden shrink-0 truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)] md:inline">
          {provider ? provider.model : 'no model'}
        </span>
        {phase === 'streaming' ? (
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => { stop(); setPhase(reply ? 'review' : 'prompt') }}>
            <Stop size={12} weight="fill" aria-hidden /> Stop
          </button>
        ) : phase === 'review' ? (
          <>
            <button type="button" className="lp-btn lp-btn-accent lp-btn-sm" onClick={accept} title="Accept (Ctrl+Enter)">
              <Check size={12} weight="bold" aria-hidden /> Accept
            </button>
            <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => void run(instruction)} title="Regenerate">
              <ArrowClockwise size={12} aria-hidden />
            </button>
          </>
        ) : (
          <button type="button" className="lp-btn lp-btn-accent lp-btn-sm" disabled={!instruction.trim()} onClick={() => void run(instruction)}>
            Generate
          </button>
        )}
        <button type="button" className="lp-mini-btn" aria-label="Close (Esc)" title="Close (Esc)" onClick={() => { stop(); onClose() }}>
          <X size={13} />
        </button>
      </div>

      {phase === 'error' && error ? (
        <div className="mx-4 mt-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)]">
          {error}
        </div>
      ) : null}

      {phase === 'streaming' || phase === 'review' ? (
        <div className="mx-4 mb-4 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
            {phase === 'streaming' ? <Spinner size={11} /> : <Check size={12} className="text-[var(--color-ok)]" aria-hidden />}
            {phase === 'streaming' ? 'Generating…' : 'Review the change'}
            <span className="ml-auto text-[10px] text-[var(--color-text-faint)]">
              {phase === 'review' ? 'Ctrl+Enter accept · Esc discard' : ''}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <DiffEditor
              original={target.fullText}
              modified={modified}
              language={target.language}
              theme={theme}
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                fontSize: 12,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderOverviewRuler: false,
                hideUnchangedRegions: { enabled: true, contextLineCount: 3 }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
