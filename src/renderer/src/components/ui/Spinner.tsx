import { CircleNotch } from '@phosphor-icons/react'

export function Spinner({
  size = 14,
  className = ''
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <CircleNotch
      size={size}
      className={`shrink-0 text-[var(--color-accent)] motion-safe:animate-spin ${className}`.trim()}
      aria-hidden
    />
  )
}
