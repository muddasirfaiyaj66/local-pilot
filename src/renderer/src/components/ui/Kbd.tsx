const IS_MAC =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent)

/** Render a shortcut string ("Mod+K") as keycaps. */
export function Kbd({ keys }: { keys: string }): React.JSX.Element {
  const parts = keys.split('+').map((k) => (k === 'Mod' ? (IS_MAC ? '⌘' : 'Ctrl') : k))
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part) => (
        <kbd key={part} className="lp-kbd">
          {part}
        </kbd>
      ))}
    </span>
  )
}
