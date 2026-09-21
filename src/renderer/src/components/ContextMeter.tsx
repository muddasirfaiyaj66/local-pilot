import { useAppStore } from '../store/appStore'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** Compact context usage — thin bar + mono label (no model name; select already shows it). */
export function ContextMeter(): React.JSX.Element {
  const usage = useAppStore((s) => s.usage)

  if (!usage) {
    return (
      <div className="lp-context" title="Context usage">
        <div className="lp-context-bar" aria-hidden>
          <div className="lp-context-fill" style={{ width: '0%' }} />
        </div>
        <span>—</span>
      </div>
    )
  }

  const pct = Math.min(100, Math.round((usage.totalTokens / usage.contextLimit) * 100))
  const barColor =
    pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warn)' : 'var(--color-accent)'

  return (
    <div
      className="lp-context"
      title={`${usage.promptTokens} prompt + ${usage.completionTokens} completion${usage.estimated ? ' (estimated)' : ''} · ${pct}%`}
    >
      <div className="lp-context-bar" aria-hidden>
        <div
          className="lp-context-fill"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span>
        {formatTokens(usage.totalTokens)}
        <span className="text-[var(--color-text-faint)]">/{formatTokens(usage.contextLimit)}</span>
        {usage.estimated ? <span className="text-[var(--color-text-faint)]">~</span> : null}
      </span>
    </div>
  )
}
