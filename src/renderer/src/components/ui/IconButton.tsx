import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Square icon-only button with an accessible name. */
export function IconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`lp-icon-btn ${className}`.trim()}
      aria-label={label}
      title={props.title ?? label}
      {...props}
    >
      {children}
    </button>
  )
}
