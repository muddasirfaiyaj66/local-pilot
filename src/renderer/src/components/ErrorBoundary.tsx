import { WarningCircle } from '@phosphor-icons/react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches render errors so one broken pane cannot blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('LocalPilot render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)] px-6 text-center"
      >
        <WarningCircle size={28} weight="fill" className="text-[var(--color-danger)]" aria-hidden />
        <div className="text-[14px] font-medium text-[var(--color-text)]">
          Something broke in the interface
        </div>
        <pre className="max-w-[560px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)]">
          {error.message}
        </pre>
        <button
          type="button"
          className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-2)]"
          onClick={() => this.setState({ error: null })}
        >
          Reload view
        </button>
      </div>
    )
  }
}
