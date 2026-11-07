import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem =
  | 'divider'
  | {
      label: string
      icon?: ReactNode
      keys?: string
      danger?: boolean
      disabled?: boolean
      run: () => void
    }

/** Right-click menu: arrow keys, Enter, Escape, click-away; stays inside the window. */
export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const actionable = items.flatMap((item, index) => (item !== 'divider' && !item.disabled ? [index] : []))
  const [active, setActive] = useState(actionable[0] ?? -1)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))
    })
    el.focus()
  }, [x, y])

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onBlur = (): void => onClose()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    event.stopPropagation()
    const at = actionable.indexOf(active)
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(actionable[(at + 1) % actionable.length] ?? -1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(actionable[(at - 1 + actionable.length) % actionable.length] ?? -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[active]
      if (item && item !== 'divider') {
        onClose()
        item.run()
      }
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="lp-menu"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) =>
        item === 'divider' ? (
          <div key={`d${index}`} className="lp-menu-divider" role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`lp-menu-item ${index === active ? 'is-active' : ''} ${item.danger ? 'is-danger' : ''}`}
            onMouseEnter={() => setActive(index)}
            onClick={() => {
              onClose()
              item.run()
            }}
          >
            <span className="flex w-4 justify-center">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.keys ? <span className="text-[10px] text-[var(--color-text-faint)]">{item.keys}</span> : null}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
