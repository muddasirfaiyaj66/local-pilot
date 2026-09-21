import { PaperPlaneTilt, Stop } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'
import type { PermissionMode } from '@shared/types'
import { Button } from './ui/Button'

const MODES: { id: PermissionMode; label: string }[] = [
  { id: 'ask-every-time', label: 'Ask always' },
  { id: 'ask-risky', label: 'Ask risky' },
  { id: 'autonomous', label: 'Autonomous' }
]

export function BottomBar({ canSend }: { canSend: boolean }): React.JSX.Element {
  const providers = useAppStore((s) => s.providers)
  const settings = useAppStore((s) => s.settings)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const stopStreaming = useAppStore((s) => s.stopStreaming)
  const version = useAppStore((s) => s.version)

  const activeId = settings?.activeProviderId ?? ''

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="lp-provider">
        Model provider
      </label>
      <select
        id="lp-provider"
        value={activeId}
        onChange={(e) => void setActiveProvider(e.target.value)}
        className="lp-input w-auto max-w-[220px] py-1.5 text-[12px]"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.model}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="lp-permission">
        Permission mode
      </label>
      <select
        id="lp-permission"
        value={settings?.permissionMode ?? 'ask-risky'}
        onChange={(e) => void setPermissionMode(e.target.value as PermissionMode)}
        className="lp-input w-auto py-1.5 text-[12px]"
        title="Enforced in Phase 2"
      >
        {MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      <span className="lp-mono text-[10px] text-[var(--color-muted-foreground)]">v{version}</span>

      {isStreaming ? (
        <Button
          variant="danger"
          type="button"
          onClick={() => void stopStreaming()}
          aria-label="Stop generation"
        >
          <Stop size={14} weight="fill" aria-hidden />
          STOP
        </Button>
      ) : (
        <button type="submit" disabled={!canSend} className="lp-btn lp-btn-accent">
          <PaperPlaneTilt size={14} weight="fill" aria-hidden />
          Send
        </button>
      )}
    </div>
  )
}
