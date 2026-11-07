import { useAppStore } from '../store/appStore'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
}

/** Persistent telemetry strip along the bottom of the work surface. */
export function StatusBar(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const providers = useAppStore((s) => s.providers)
  const interactionMode = useAppStore((s) => s.interactionMode)
  const sessions = useAppStore((s) => s.sessions)
  const usage = useAppStore((s) => s.usage)
  const processes = useAppStore((s) => s.processes)

  const provider = providers.find((p) => p.id === settings?.activeProviderId)
  const runningAgents = Object.values(sessions).filter((s) => s.run.isStreaming).length
  const runningServers = processes.filter((p) => p.running).length
  const workspace = settings?.workspacePath?.trim()
  const pct = usage ? Math.min(100, Math.round((usage.totalTokens / usage.contextLimit) * 100)) : null

  return (
    <div className="lp-statusbar" role="status" aria-live="off">
      <span title={provider?.name ?? 'No provider'}>
        {provider?.model ?? 'no model'}
      </span>
      <span className="text-[var(--color-border-strong)]">|</span>
      <span className="capitalize">{interactionMode}</span>
      <span className="text-[var(--color-border-strong)]">|</span>
      <span>{settings?.permissionMode ?? 'ask-risky'}</span>
      <div className="flex-1" />
      {runningServers > 0 ? <span className="text-[var(--color-ok)]">{runningServers} server</span> : null}
      {runningAgents > 0 ? <span className="text-[var(--color-accent)]">{runningAgents} agent</span> : null}
      {usage ? (
        <span title={`${usage.promptTokens} prompt + ${usage.completionTokens} completion`}>
          {usage.estimated ? '~' : ''}
          {formatTokens(usage.totalTokens)}/{formatTokens(usage.contextLimit)} · {pct}%
        </span>
      ) : null}
      {workspace ? (
        <span className="max-w-[160px] truncate" title={workspace}>
          {basename(workspace)}
        </span>
      ) : null}
    </div>
  )
}
