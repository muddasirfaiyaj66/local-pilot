import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

export function PermissionModal(): React.JSX.Element | null {
  const pending = useAppStore((s) => s.pendingPermission)
  const askDraft = useAppStore((s) => s.askDraft)
  const setAskDraft = useAppStore((s) => s.setAskDraft)
  const respondPermission = useAppStore((s) => s.respondPermission)
  const respondAsk = useAppStore((s) => s.respondAsk)
  const tasks = useAppStore((s) => s.tasks)
  const requestToTask = useAppStore((s) => s.requestToTask)
  const setView = useAppStore((s) => s.setView)
  const [busy, setBusy] = useState(false)

  if (!pending) return null

  const isAsk = pending.toolName === 'ask_user'
  const taskId = pending.taskId ?? requestToTask[pending.agentRequestId]
  const taskTitle = tasks.find((t) => t.id === taskId)?.title

  const onAllow = async (): Promise<void> => {
    setBusy(true)
    try {
      if (isAsk) await respondAsk(askDraft || 'OK')
      else await respondPermission(true)
    } finally {
      setBusy(false)
    }
  }

  const onDeny = async (): Promise<void> => {
    setBusy(true)
    try {
      if (isAsk) await respondAsk('User cancelled')
      else await respondPermission(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => void onDeny()}
      labelledBy="lp-perm-title"
      className="max-w-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="lp-perm-title" className="text-[14px] font-semibold text-[var(--color-text)]">
            {isAsk ? 'Agent needs input' : 'Approve action'}
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-faint)]">
            {taskTitle ? `Chat: ${taskTitle}` : pending.toolName}
          </p>
        </div>
        <Badge
          tone={pending.risk === 'critical' ? 'danger' : pending.risk === 'risky' ? 'warn' : 'ok'}
        >
          {pending.risk}
        </Badge>
      </div>

      <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
        {isAsk ? pending.preview || 'The agent asked a question.' : pending.toolName}
      </p>

      {!isAsk && (
        <pre className="mt-3 max-h-56 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-[var(--font-mono)] text-[12px] text-[var(--color-text)]">
          {pending.preview}
        </pre>
      )}

      {isAsk && (
        <textarea
          className="lp-input mt-3 min-h-[64px]"
          value={askDraft}
          onChange={(e) => setAskDraft(e.target.value)}
          placeholder="Your reply…"
          autoFocus
        />
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="quiet" onClick={() => setView('settings')}>
          Permission settings
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => void onDeny()}>
            {isAsk ? 'Cancel' : 'Deny'}
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void onAllow()}>
            {isAsk ? 'Send reply' : 'Approve'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
