import { useAppStore } from '../store/appStore'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function ContextMeter(): React.JSX.Element {
  const usage = useAppStore((s) => s.usage)
  const providers = useAppStore((s) => s.providers)
  const settings = useAppStore((s) => s.settings)
  const model = providers.find((p) => p.id === settings?.activeProviderId)?.model ?? '—'

  if (!usage) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]">
        <span className="truncate font-[var(--font-mono)]">{model}</span>
        <span>·</span>
        <span>context —</span>
      </div>
    )
  }

  const pct = Math.min(100, Math.round((usage.totalTokens / usage.contextLimit) * 100))
  const barColor =
    pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warn)' : 'var(--color-accent)'

  return (
    <div
      className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--color-text-muted)]"
      title={`${usage.promptTokens} prompt + ${usage.completionTokens} completion${usage.estimated ? ' (estimated)' : ''}`}
    >
      <span className="max-w-[140px] truncate font-[var(--font-mono)] text-[var(--color-text-faint)]">
        {model}
      </span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-border)]" aria-hidden>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="shrink-0 font-[var(--font-mono)] tabular-nums">
        {formatTokens(usage.totalTokens)}
        <span className="text-[var(--color-text-faint)]"> / {formatTokens(usage.contextLimit)}</span>
        {usage.estimated ? <span className="text-[var(--color-text-faint)]"> ~</span> : null}
      </span>
    </div>
  )
}
