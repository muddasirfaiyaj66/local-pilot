import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok'

const toneClass: Record<Tone, string> = {
  neutral: '',
  accent: 'is-accent',
  danger: 'is-danger',
  warn: 'is-warn',
  ok: 'is-ok'
}

export function Badge({
  tone = 'neutral',
  className = '',
  children
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return <span className={`lp-badge ${toneClass[tone]} ${className}`.trim()}>{children}</span>
}
