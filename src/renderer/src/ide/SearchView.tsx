import { CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TextSearchHit } from '@shared/ipc'
import { usePersistentState } from '../hooks/usePersistentState'
import { FileIcon } from './FileIcon'
import { useIdeStore } from './ideStore'
import { MiniButton } from './Explorer'

export function SearchView({ focusNonce }: { focusNonce: number }): React.JSX.Element {
  const workspace = useIdeStore((s) => s.workspace)
  const openFile = useIdeStore((s) => s.openFile)
  const [query, setQuery] = useState('')
  const [opts, setOpts] = usePersistentState('lp.ide.searchOpts', {
    caseSensitive: false,
    wholeWord: false,
    regex: false
  })
  const [hits, setHits] = useState<TextSearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusNonce])

  useEffect(() => {
    if (!query.trim() || !workspace) {
      setHits([])
      return
    }
    const id = ++seq.current
    setBusy(true)
    const timer = window.setTimeout(() => {
      void window.localpilot
        .searchWorkspaceText(query, { ...opts, maxResults: 1000 })
        .then((result) => {
          if (id === seq.current) setHits(result)
        })
        .finally(() => {
          if (id === seq.current) setBusy(false)
        })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [query, opts, workspace])

  const grouped = useMemo(() => {
    const map = new Map<string, TextSearchHit[]>()
    for (const hit of hits) {
      const list = map.get(hit.path) ?? []
      list.push(hit)
      map.set(hit.path, list)
    }
    return [...map.entries()]
  }, [hits])

  const highlight = (preview: string): React.ReactNode => {
    if (!query) return preview
    try {
      const source = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(opts.wholeWord ? `\\b(?:${source})\\b` : source, opts.caseSensitive ? '' : 'i')
      const match = re.exec(preview)
      if (!match || match[0].length === 0) return preview
      return (
        <>
          {preview.slice(0, match.index)}
          <mark className="lp-search-mark">{match[0]}</mark>
          {preview.slice(match.index + match[0].length)}
        </>
      )
    } catch {
      return preview
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="lp-side-section-head">Search</div>
      <div className="px-3 pb-2">
        <div className="lp-search-box">
          <MagnifyingGlass size={13} className="shrink-0 text-[var(--color-text-faint)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files"
            aria-label="Search in files"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--color-text-faint)]"
          />
          <MiniButton label="Match Case" active={opts.caseSensitive} onClick={() => setOpts({ ...opts, caseSensitive: !opts.caseSensitive })}>
            <span className="font-[var(--font-mono)] text-[11px]">Aa</span>
          </MiniButton>
          <MiniButton label="Match Whole Word" active={opts.wholeWord} onClick={() => setOpts({ ...opts, wholeWord: !opts.wholeWord })}>
            <span className="font-[var(--font-mono)] text-[11px] underline">ab</span>
          </MiniButton>
          <MiniButton label="Use Regular Expression" active={opts.regex} onClick={() => setOpts({ ...opts, regex: !opts.regex })}>
            <span className="font-[var(--font-mono)] text-[11px]">.*</span>
          </MiniButton>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]" aria-live="polite">
          {!workspace
            ? 'Open a folder to search.'
            : busy
              ? 'Searching…'
              : query
                ? `${hits.length}${hits.length >= 1000 ? '+' : ''} results in ${grouped.length} files`
                : ' '}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {grouped.map(([path, list]) => {
          const isCollapsed = collapsed[path]
          return (
            <div key={path}>
              <button
                type="button"
                className="lp-tree-row"
                style={{ paddingLeft: 8 }}
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((c) => ({ ...c, [path]: !isCollapsed }))}
                title={path}
              >
                <CaretRight size={10} className={`shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} aria-hidden />
                <FileIcon name={path} />
                <span className="truncate">{path.split('/').pop()}</span>
                <span className="truncate text-[10px] text-[var(--color-text-faint)]">{path.split('/').slice(0, -1).join('/')}</span>
                <span className="lp-count-pill ml-auto">{list.length}</span>
              </button>
              {isCollapsed
                ? null
                : list.map((hit) => (
                    <button
                      key={`${hit.path}:${hit.line}:${hit.column}`}
                      type="button"
                      className="lp-tree-row !text-[11px]"
                      style={{ paddingLeft: 34 }}
                      onClick={() => void openFile(hit.path, hit.line)}
                      title={`${hit.path}:${hit.line}`}
                    >
                      <span className="truncate font-[var(--font-mono)]">{highlight(hit.preview)}</span>
                      <span className="ml-auto shrink-0 pl-2 text-[10px] text-[var(--color-text-faint)]">{hit.line}</span>
                    </button>
                  ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
