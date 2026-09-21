import { useState } from 'react'
import { useAppStore } from '../store/appStore'

export function PermissionModal(): React.JSX.Element | null {
  const pending = useAppStore((s) => s.pendingPermission)
  const askDraft = useAppStore((s) => s.askDraft)
  const setAskDraft = useAppStore((s) => s.setAskDraft)
  const respondPermission = useAppStore((s) => s.respondPermission)
  const respondAsk = useAppStore((s) => s.respondAsk)
  const tasks = useAppStore((s) => s.tasks)
  const requestToTask = useAppStore((s) => s.requestToTask)
  const [busy, setBusy] = useState(false)

  if (!pending) return null

  const isAsk = pending.toolName === 'ask_user'
  const taskId = pending.taskId ?? requestToTask[pending.agentRequestId]
  const taskTitle = tasks.find((t) => t.id === taskId)?.title

  const onAllow = async (): Promise<void> => {
    setBusy(true)
    try {
      if (isAsk) {
        await respondAsk(askDraft || 'OK')
      } else {
        await respondPermission(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const onDeny = async (): Promise<void> => {
    setBusy(true)
    try {
      if (isAsk) {
        await respondAsk('User cancelled')
      } else {
        await respondPermission(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lp-perm-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="lp-perm-title" className="text-[14px] font-semibold text-[var(--color-text)]">
              {isAsk ? 'Agent needs input' : 'Approve action'}
            </h2>
            {taskTitle ? (
              <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">Chat: {taskTitle}</p>
            ) : null}
          </div>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
              pending.risk === 'critical'
                ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                : pending.risk === 'risky'
                  ? 'bg-[var(--color-warn)]/20 text-[var(--color-warn)]'
                  : 'bg-[var(--color-ok)]/20 text-[var(--color-ok)]'
            }`}
          >
            {pending.risk}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{pending.toolName}</p>
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-[var(--font-mono)] text-[12px] text-[var(--color-text)]">
          {pending.preview}
        </pre>
        {isAsk && (
          <textarea
            className="lp-input mt-3 min-h-[64px]"
            value={askDraft}
            onChange={(e) => setAskDraft(e.target.value)}
            placeholder="Your reply…"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="lp-btn lp-btn-ghost" disabled={busy} onClick={() => void onDeny()}>
            {isAsk ? 'Cancel' : 'Deny'}
          </button>
          <button
            type="button"
            className="lp-btn lp-btn-accent"
            disabled={busy}
            onClick={() => void onAllow()}
          >
            {isAsk ? 'Send reply' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
