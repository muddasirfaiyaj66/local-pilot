import { Image as ImageIcon, Paperclip, PaperPlaneTilt, Stop, X } from '@phosphor-icons/react'
import { useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { useAppStore, type InteractionMode } from '../store/appStore'
import type { PermissionMode } from '@shared/types'
import { ContextMeter } from './ContextMeter'

const MODES: { id: PermissionMode; label: string }[] = [
  { id: 'ask-every-time', label: 'Ask always' },
  { id: 'ask-risky', label: 'Ask risky' },
  { id: 'autonomous', label: 'Autonomous' }
]

interface ComposerProps {
  draft: string
  setDraft: (v: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  onSubmit: (e: FormEvent) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  canSend: boolean
}

async function readFileAsAttachment(file: File): Promise<{
  name: string
  kind: 'image' | 'file'
  mimeType: string
  data?: string
  textContent?: string
  size: number
}> {
  const isImage = file.type.startsWith('image/')
  if (isImage) {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
    return {
      name: file.name,
      kind: 'image',
      mimeType: file.type || 'image/png',
      data: btoa(binary),
      size: file.size
    }
  }
  const text = await file.text()
  return {
    name: file.name,
    kind: 'file',
    mimeType: file.type || 'text/plain',
    textContent: text,
    size: file.size
  }
}

export function Composer({
  draft,
  setDraft,
  inputRef,
  onSubmit,
  onKeyDown,
  canSend
}: ComposerProps): React.JSX.Element {
  const interactionMode = useAppStore((s) => s.interactionMode)
  const setInteractionMode = useAppStore((s) => s.setInteractionMode)
  const providers = useAppStore((s) => s.providers)
  const settings = useAppStore((s) => s.settings)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const attachments = useAppStore((s) => s.attachments)
  const addAttachment = useAppStore((s) => s.addAttachment)
  const removeAttachment = useAppStore((s) => s.removeAttachment)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const stopStreaming = useAppStore((s) => s.stopStreaming)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [mentions, setMentions] = useState<string[]>([])
  const [mentionStart, setMentionStart] = useState<number | null>(null)

  const syncMention = (value: string, cursor: number): void => {
    const upto = value.slice(0, cursor)
    const match = upto.match(/(^|\s)@([A-Za-z0-9_./\\-]*)$/)
    if (!match) {
      setMentions([])
      setMentionStart(null)
      return
    }
    const query = match[2] ?? ''
    setMentionStart(upto.length - query.length - 1)
    void window.localpilot
      .searchWorkspaceFiles(query)
      .then(setMentions)
      .catch(() => setMentions([]))
  }

  const insertMention = (path: string): void => {
    if (mentionStart == null) return
    const cursor = inputRef.current?.selectionStart ?? draft.length
    const next = `${draft.slice(0, mentionStart)}@${path} ${draft.slice(cursor)}`
    setDraft(next)
    setMentions([])
    setMentionStart(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const activeId = settings?.activeProviderId ?? ''
  const looksLikeCreate = /\b(create|build|scaffold|make|implement|generate|bootstrap|set\s*up)\b/i.test(
    draft
  )
  const showAgentHint = interactionMode === 'plan' && looksLikeCreate

  const onPick = async (files: FileList | null): Promise<void> => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.size > 8_000_000) continue
      const att = await readFileAsAttachment(file)
      addAttachment(att)
    }
  }

  return (
    <div className="lp-composer-dock">
      <form
        onSubmit={onSubmit}
        className="lp-composer relative"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          void onPick(e.dataTransfer.files)
        }}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] px-3 pt-2.5 pb-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex max-w-[200px] items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px]"
              >
                {a.kind === 'image' && a.data ? (
                  <img
                    src={`data:${a.mimeType};base64,${a.data}`}
                    alt=""
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <Paperclip size={12} className="text-[var(--color-text-faint)]" aria-hidden />
                )}
                <span className="truncate text-[var(--color-text-muted)]">{a.name}</span>
                <button
                  type="button"
                  className="lp-icon-btn !h-5 !w-5"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAttachment(a.id)}
                >
                  <X size={10} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}

        {showAgentHint && (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
            <span>Plan mode is read-only. Switch to Agent to create files.</span>
            <button
              type="button"
              className="shrink-0 rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-text)] hover:bg-[var(--color-hover)]"
              onClick={() => setInteractionMode('agent')}
            >
              Use Agent
            </button>
          </div>
        )}

        <label className="sr-only" htmlFor="lp-composer">
          Message
        </label>
        {mentions.length > 0 && (
          <ul className="absolute right-3 bottom-full left-3 z-10 mb-1 max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 shadow-none">
            {mentions.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className="block w-full truncate px-2.5 py-1 text-left font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(path)
                  }}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          id="lp-composer"
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            interactionMode === 'plan'
              ? 'Describe a goal — Plan inspects, then proposes steps…'
              : interactionMode === 'agent'
                ? 'Give the agent a goal…'
                : 'Message LocalPilot…'
          }
          className="min-h-[52px] max-h-[200px] w-full resize-none border-0 bg-transparent px-3.5 pt-2.5 pb-1 text-[13px] leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />

        <div className="lp-composer-toolbar">
          <div className="lp-chip">
            <select
              aria-label="Interaction mode"
              value={interactionMode}
              onChange={(e) => setInteractionMode(e.target.value as InteractionMode)}
              className="lp-select"
            >
              <option value="agent">Agent</option>
              <option value="plan">Plan</option>
              <option value="chat">Chat</option>
            </select>
          </div>

          <div className="lp-chip">
            <select
              aria-label="Model provider"
              value={activeId}
              onChange={(e) => void setActiveProvider(e.target.value)}
              className="lp-select max-w-[160px] truncate"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.model}
                </option>
              ))}
            </select>
          </div>

          {interactionMode !== 'chat' && (
            <div className="lp-chip">
              <select
                aria-label="Permission mode"
                value={settings?.permissionMode ?? 'ask-risky'}
                onChange={(e) => void setPermissionMode(e.target.value as PermissionMode)}
                className="lp-select"
                title="Ctrl/Cmd+Shift+. stops all agents"
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            multiple
            onChange={(e) => {
              void onPick(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              void onPick(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="lp-icon-btn"
            title="Attach image"
            aria-label="Attach image"
            onClick={() => imageRef.current?.click()}
          >
            <ImageIcon size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="lp-icon-btn"
            title="Attach file"
            aria-label="Attach file"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={15} aria-hidden />
          </button>

          <ContextMeter />

          {isStreaming ? (
            <button
              type="button"
              className="lp-stop"
              onClick={() => void stopStreaming()}
              aria-label="Stop"
            >
              <Stop size={11} weight="fill" aria-hidden />
              Stop
            </button>
          ) : (
            <button type="submit" className="lp-send" disabled={!canSend} aria-label="Send">
              <PaperPlaneTilt size={13} weight="fill" aria-hidden />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
