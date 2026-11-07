import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'accent' | 'danger' | 'ghost' | 'quiet'
type Size = 'sm' | 'md'

const variantClass: Record<Variant, string> = {
  accent: 'lp-btn-accent',
  danger: 'lp-btn-danger',
  ghost: 'lp-btn-ghost',
  quiet: 'lp-btn-quiet'
}

export function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`lp-btn ${variantClass[variant]} ${size === 'sm' ? 'lp-btn-sm' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={12} /> : null}
      {children}
    </button>
  )
}
