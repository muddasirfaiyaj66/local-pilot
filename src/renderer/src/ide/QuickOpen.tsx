import { MagnifyingGlass } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../components/ui/Dialog'
import { FileIcon } from './FileIcon'

/** Ctrl+P: fuzzy-ish file finder over the workspace. */
export function QuickOpen({
  open,
  onClose,
  onPick,
  recent
}: {
  open: boolean
  onClose: () => void
  onPick: (path: string) => void
  recent: string[]
}): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!query.trim()) {
      setResults(recent)
      return
    }
    const id = ++seq.current
    const timer = window.setTimeout(() => {
      void window.localpilot.searchWorkspaceFiles(query.trim()).then((hits) => {
        if (id !== seq.current) return
        const needle = query.trim().toLowerCase()
        // Basename matches first, then shorter paths.
        const score = (p: string): number => {
          const base = p.split('/').pop()!.toLowerCase()
          return (base.startsWith(needle) ? 0 : base.includes(needle) ? 1 : 2) * 1000 + p.length
        }
        setResults([...hits].sort((a, b) => score(a) - score(b)))
        setActive(0)
      })
    }, 90)
    return () => window.clearTimeout(timer)
  }, [query, open, recent])

  const pick = (path: string | undefined): void => {
    if (!path) return
    onClose()
    onPick(path)
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="lp-quick-open" className="max-w-xl !p-0">
      <h2 id="lp-quick-open" className="sr-only">
        Go to file
      </h2>
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
        <MagnifyingGlass size={14} className="text-[var(--color-text-faint)]" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(results[active])
            }
          }}
          placeholder="Search files by name"
          aria-label="Search files by name"
          className="lp-palette-input !border-0 !px-0"
        />
      </div>
      <ul className="lp-palette-list" role="listbox" aria-label="Files">
        {results.length === 0 ? (
          <li className="px-3 py-4 text-center text-[12px] text-[var(--color-text-faint)]">
            {query ? 'No matching files' : 'Type to search files'}
          </li>
        ) : null}
        {results.map((path, index) => (
          <li key={path} role="option" aria-selected={index === active}>
            <button
              type="button"
              data-active={index === active}
              className="lp-palette-item"
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(path)}
            >
              <FileIcon name={path} />
              <span className="truncate">{path.split('/').pop()}</span>
              <span className="truncate text-[11px] text-[var(--color-text-faint)]">
                {path.split('/').slice(0, -1).join('/')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
