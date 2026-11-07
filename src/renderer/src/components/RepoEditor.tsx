import { CaretRight, FileCode, Folder, FolderOpen, FloppyDisk, ArrowCounterClockwise, GitDiff } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diffHunks } from '@shared/diff'
import type { WorkspaceTreeNode } from '@shared/ipc'
import { useAppStore } from '../store/appStore'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

/** VS Code-style repo explorer with a manual editor and a review diff. */
export function RepoEditor(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const workspace = settings?.workspacePath?.trim() ?? ''
  const queueComposerInsert = useAppStore((s) => s.queueComposerInsert)
  const openInEditor = useAppStore((s) => s.openInEditor)

  const [roots, setRoots] = useState<WorkspaceTreeNode[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [children, setChildren] = useState<Record<string, WorkspaceTreeNode[]>>({})
  const [activePath, setActivePath] = useState<string | null>(null)
  const [original, setOriginal] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [saving, setSaving] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const dirty = Boolean(activePath) && text !== original

  useEffect(() => {
    if (!workspace) {
      setRoots([])
      return
    }
    void window.localpilot.workspaceChildren('').then(setRoots).catch(() => setRoots([]))
    setExpanded({})
    setChildren({})
    setActivePath(null)
    setOriginal('')
    setText('')
    setStatus(null)
    setShowReview(false)
  }, [workspace])

  const loadChildren = useCallback(async (path: string): Promise<void> => {
    const list = await window.localpilot.workspaceChildren(path)
    setChildren((prev) => ({ ...prev, [path]: list }))
  }, [])

  const toggleDir = useCallback(
    (node: WorkspaceTreeNode): void => {
      const isOpen = expanded[node.path]
      setExpanded((prev) => ({ ...prev, [node.path]: !isOpen }))
      if (!isOpen && !children[node.path]) void loadChildren(node.path).catch(() => undefined)
    },
    [expanded, children, loadChildren]
  )

  const openFile = useCallback(async (node: WorkspaceTreeNode): Promise<void> => {
    setLoading(true)
    setStatus(null)
    setShowReview(false)
    try {
      const result = await window.localpilot.readWorkspaceFile(node.path, 200_000)
      if (!result.ok || result.text == null) {
        setStatus(result.error ?? 'Could not read file')
        return
      }
      if (result.binary || result.truncated) {
        // Saving a partial buffer would cut the file short on disk.
        setStatus(result.binary ? 'Binary file — not editable here' : 'Large file — open it in the Code view')
        return
      }
      setActivePath(node.path)
      setOriginal(result.text)
      setText(result.text)
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (): Promise<void> => {
    if (!activePath || saving) return
    setSaving(true)
    try {
      const result = await window.localpilot.writeWorkspaceFile(activePath, text)
      if (result.ok) {
        setOriginal(text)
        setStatus('Saved')
      } else {
        setStatus(result.error ?? 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }, [activePath, text, saving])

  const revert = useCallback((): void => {
    setText(original)
    setStatus('Reverted to disk')
  }, [original])

  const lineCount = useMemo(() => text.split('\n').length, [text])
  const hunks = useMemo(() => (showReview ? diffHunks(original, text) : []), [showReview, original, text])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = event.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = `${text.slice(0, start)}  ${text.slice(end)}`
      setText(next)
      requestAnimationFrame(() => {
        el.selectionStart = start + 2
        el.selectionEnd = start + 2
      })
    }
  }

  const renderNode = (node: WorkspaceTreeNode, depth: number): React.JSX.Element => {
    const paddingLeft = 6 + depth * 12
    if (node.dir) {
      const isOpen = Boolean(expanded[node.path])
      const nested = children[node.path] ?? []
      return (
        <div key={node.path}>
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-[var(--radius-sm)] py-0.5 text-left text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
            style={{ paddingLeft }}
            onClick={() => toggleDir(node)}
            aria-expanded={isOpen}
          >
            <CaretRight
              size={9}
              className={`shrink-0 text-[var(--color-text-faint)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
              aria-hidden
            />
            {isOpen ? (
              <FolderOpen size={12} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
            ) : (
              <Folder size={12} className="shrink-0 text-[var(--color-text-faint)]" aria-hidden />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {isOpen ? nested.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      )
    }
    const active = activePath === node.path
    return (
      <button
        key={node.path}
        type="button"
        className={`flex w-full items-center gap-1 rounded-[var(--radius-sm)] py-0.5 text-left text-[11px] ${
          active
            ? 'bg-[var(--color-hover)] text-[var(--color-text)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]'
        }`}
        style={{ paddingLeft: paddingLeft + 10 }}
        onClick={() => void openFile(node)}
        title={node.path}
      >
        <FileCode size={12} className="shrink-0 text-[var(--color-text-faint)]" aria-hidden />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-[var(--color-text-faint)]">
        Open a folder to browse and edit its code.
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          Explorer
        </span>
        {activePath ? (
          <span className="min-w-0 flex-1 truncate text-right font-[var(--font-mono)] text-[10px] text-[var(--color-text-muted)]">
            {activePath}
            {dirty ? ' •' : ''}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[45%] shrink-0 overflow-y-auto border-r border-[var(--color-border)] py-1 pr-1">
          {roots.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-[var(--color-text-faint)]">Empty workspace.</p>
          ) : (
            roots.map((node) => renderNode(node, 0))
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {activePath ? (
            <>
              <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
                <Button variant="accent" size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
                  <FloppyDisk size={12} aria-hidden />
                  Save
                </Button>
                <Button size="sm" disabled={!dirty} onClick={revert}>
                  <ArrowCounterClockwise size={12} aria-hidden />
                  Revert
                </Button>
                <Button
                  size="sm"
                  variant={showReview ? 'quiet' : 'ghost'}
                  onClick={() => setShowReview((v) => !v)}
                  aria-pressed={showReview}
                >
                  <GitDiff size={12} aria-hidden />
                  Review{hunks.length > 0 ? ` (${hunks.length})` : ''}
                </Button>
                <button
                  type="button"
                  className="ml-auto text-[10px] text-[var(--color-accent)] hover:underline"
                  onClick={() => queueComposerInsert(`@${activePath} `)}
                >
                  @ insert
                </button>
                <button
                  type="button"
                  className="text-[10px] text-[var(--color-accent)] hover:underline"
                  onClick={() => openInEditor(activePath)}
                >
                  Open in Code
                </button>
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div
                  ref={gutterRef}
                  className="w-9 shrink-0 select-none overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg)] pt-2 text-right font-[var(--font-mono)] text-[11px] leading-[18px] text-[var(--color-text-faint)]"
                  aria-hidden
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i} className="h-[18px] pr-2">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onScroll={() => {
                    if (gutterRef.current && textareaRef.current) {
                      gutterRef.current.scrollTop = textareaRef.current.scrollTop
                    }
                  }}
                  onKeyDown={onKeyDown}
                  spellCheck={false}
                  wrap="off"
                  aria-label={`Editing ${activePath}`}
                  className="min-h-0 flex-1 resize-none overflow-auto border-0 bg-[var(--color-bg)] px-2 pt-2 font-[var(--font-mono)] text-[11px] leading-[18px] whitespace-pre text-[var(--color-text)] outline-none"
                />
              </div>

              {showReview ? (
                <div className="max-h-40 overflow-y-auto border-t border-[var(--color-border)] p-2">
                  {hunks.length === 0 ? (
                    <p className="text-[11px] text-[var(--color-text-faint)]">No unsaved changes.</p>
                  ) : (
                    hunks.map((hunk, index) => (
                      <div key={index} className="mb-2 rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                        <div className="px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                          @@ -{hunk.beforeStart + 1} +{hunk.afterStart + 1}
                        </div>
                        <pre className="max-h-28 overflow-auto px-2 pb-1 font-[var(--font-mono)] text-[10px] leading-relaxed">
                          {hunk.beforeLines.map((line, i) => (
                            <div key={`d${i}`} className="text-[var(--color-danger)]">- {line}</div>
                          ))}
                          {hunk.afterLines.map((line, i) => (
                            <div key={`a${i}`} className="text-[var(--color-ok)]">+ {line}</div>
                          ))}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-3 text-center text-[11px] leading-relaxed text-[var(--color-text-faint)]">
              {loading ? 'Opening file…' : 'Select a file to edit. Save with Ctrl/Cmd+S.'}
            </div>
          )}
        </div>
      </div>

      {status ? (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-muted)]">
          <Badge tone={status === 'Saved' ? 'ok' : 'neutral'}>{status}</Badge>
          {dirty ? <span className="text-[var(--color-warn)]">Unsaved changes</span> : null}
        </div>
      ) : null}
    </div>
  )
}
