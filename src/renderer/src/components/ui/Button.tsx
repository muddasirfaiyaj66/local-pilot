import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'accent' | 'danger' | 'ghost' | 'quiet'

const variantClass: Record<Variant, string> = {
  accent: 'lp-btn lp-btn-accent',
  danger: 'lp-btn lp-btn-danger',
  ghost: 'lp-btn lp-btn-ghost',
  quiet: 'lp-btn lp-btn-quiet'
}

export function Button({
  variant = 'ghost',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}): React.JSX.Element {
  return (
    <button type="button" className={`${variantClass[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
}
