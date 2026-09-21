import { PaperPlaneTilt, Stop } from '@phosphor-icons/react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import { useAppStore } from '../store/appStore'
import type { PermissionMode } from '@shared/types'

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

/** Cursor-style elevated composer docked over the chat */
export function Composer({
  draft,
  setDraft,
  inputRef,
  onSubmit,
  onKeyDown,
  canSend
}: ComposerProps): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const settings = useAppStore((s) => s.settings)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const stopStreaming = useAppStore((s) => s.stopStreaming)

  const activeId = settings?.activeProviderId ?? ''

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent px-4 pb-4 pt-10">
      <form
        onSubmit={onSubmit}
        className="pointer-events-auto mx-auto w-full max-w-[720px] rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
      >
        <label className="sr-only" htmlFor="lp-composer">
          Message
        </label>
        <textarea
          id="lp-composer"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Plan, search, build anything…"
          className="min-h-[64px] w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-[13px] leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <select
            aria-label="Model provider"
            value={activeId}
            onChange={(e) => void setActiveProvider(e.target.value)}
            className="lp-select max-w-[200px] truncate"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.model}
              </option>
            ))}
          </select>

          <select
            aria-label="Permission mode"
            value={settings?.permissionMode ?? 'ask-risky'}
            onChange={(e) => void setPermissionMode(e.target.value as PermissionMode)}
            className="lp-select"
            title="Enforced in Phase 2"
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          {isStreaming ? (
            <button
              type="button"
              className="lp-stop"
              onClick={() => void stopStreaming()}
              aria-label="Stop generation"
            >
              <Stop size={12} weight="fill" aria-hidden />
              Stop
            </button>
          ) : (
            <button type="submit" className="lp-send" disabled={!canSend} aria-label="Send">
              <PaperPlaneTilt size={14} weight="fill" aria-hidden />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
