import {
  ArrowsClockwise,
  CaretRight,
  ChatCircleText,
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderSimple,
  MinusSquare,
  PencilSimple,
  Trash
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceTreeNode } from '@shared/ipc'
import { useAppStore } from '../store/appStore'
import { FileIcon } from './FileIcon'
import { useIdeStore } from './ideStore'
import { ContextMenu, type MenuItem } from './ContextMenu'

type Draft =
  | { kind: 'new-file' | 'new-folder'; parent: string }
  | { kind: 'rename'; path: string; name: string }

export function Explorer(): React.JSX.Element {
  const workspace = useIdeStore((s) => s.workspace)
  const activePath = useIdeStore((s) => s.activePath)
  const openFile = useIdeStore((s) => s.openFile)
  const onRenamed = useIdeStore((s) => s.onRenamed)
  const onDeleted = useIdeStore((s) => s.onDeleted)
  const setMessage = useIdeStore((s) => s.setMessage)
  const queueComposerInsert = useAppStore((s) => s.queueComposerInsert)
  const setView = useAppStore((s) => s.setView)
  const openWorkspace = useAppStore((s) => s.openWorkspace)

  const [children, setChildren] = useState<Record<string, WorkspaceTreeNode[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; node: WorkspaceTreeNode | null } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async (dir: string): Promise<void> => {
    const list = await window.localpilot.workspaceChildren(dir).catch(() => [])
    setChildren((prev) => ({ ...prev, [dir]: list }))
  }, [])

  const refreshAll = useCallback(async (): Promise<void> => {
    const dirs = ['', ...Object.keys(expanded).filter((k) => expanded[k])]
    await Promise.all(dirs.map((d) => load(d)))
  }, [expanded, load])

  useEffect(() => {
    setChildren({})
    setExpanded({})
    if (workspace) void load('')
  }, [workspace, load])

  const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/')

  const toggle = (node: WorkspaceTreeNode): void => {
    const open = !expanded[node.path]
    setExpanded((prev) => ({ ...prev, [node.path]: open }))
    if (open && !children[node.path]) void load(node.path)
  }

  const commitDraft = async (value: string): Promise<void> => {
    const current = draft
    setDraft(null)
    const name = value.trim()
    if (!current || !name) return
    if (/[\\:*?"<>|]/.test(name) || name.split('/').some((part) => part === '..')) {
      setMessage(`Invalid name: ${name}`, 'error')
      return
    }
    if (current.kind === 'rename') {
      if (name === current.name) return
      const to = [parentOf(current.path), name].filter(Boolean).join('/')
      const result = await window.localpilot.renameWorkspaceEntry(current.path, to)
      if (!result.ok) return setMessage(result.error ?? 'Rename failed', 'error')
      onRenamed(current.path, to)
      await load(parentOf(current.path))
      return
    }
    const path = [current.parent, name].filter(Boolean).join('/')
    const dir = current.kind === 'new-folder'
    const result = await window.localpilot.createWorkspaceEntry(path, dir)
    if (!result.ok) return setMessage(result.error ?? 'Create failed', 'error')
    if (current.parent) setExpanded((prev) => ({ ...prev, [current.parent]: true }))
    await load(current.parent)
    if (!dir) void openFile(path)
  }

  const remove = async (node: WorkspaceTreeNode): Promise<void> => {
    if (!window.confirm(`Move "${node.path}" to the trash?`)) return
    const result = await window.localpilot.deleteWorkspaceEntry(node.path)
    if (!result.ok) return setMessage(result.error ?? 'Delete failed', 'error')
    onDeleted(node.path)
    await load(parentOf(node.path))
    setMessage(`Moved ${node.name} to trash`, 'ok')
  }

  /** Where "New File" goes: the selected folder, a selected file's folder, or the root. */
  const targetDir = (node: WorkspaceTreeNode | null): string => {
    if (!node) return ''
    return node.dir ? node.path : parentOf(node.path)
  }

  const startCreate = (kind: 'new-file' | 'new-folder', node: WorkspaceTreeNode | null): void => {
    const parent = targetDir(node)
    if (parent) {
      setExpanded((prev) => ({ ...prev, [parent]: true }))
      if (!children[parent]) void load(parent)
    }
    setDraft({ kind, parent })
  }

  const menuItems = (node: WorkspaceTreeNode | null): MenuItem[] => {
    const base: MenuItem[] = [
      { label: 'New File', icon: <FilePlus size={13} />, run: () => startCreate('new-file', node) },
      { label: 'New Folder', icon: <FolderPlus size={13} />, run: () => startCreate('new-folder', node) }
    ]
    if (!node) return [...base, { label: 'Refresh', icon: <ArrowsClockwise size={13} />, run: () => void refreshAll() }]
    return [
      ...(node.dir ? [] : [{ label: 'Open', run: () => void openFile(node.path) }]),
      ...base,
      'divider',
      {
        label: 'Mention in chat',
        icon: <ChatCircleText size={13} />,
        run: () => {
          queueComposerInsert(`@${node.path} `)
          setView('chat')
        }
      },
      {
        label: 'Copy relative path',
        icon: <Copy size={13} />,
        run: () => void navigator.clipboard.writeText(node.path)
      },
      'divider',
      {
        label: 'Rename',
        icon: <PencilSimple size={13} />,
        keys: 'F2',
        run: () => setDraft({ kind: 'rename', path: node.path, name: node.name })
      },
      { label: 'Delete', icon: <Trash size={13} />, keys: 'Del', danger: true, run: () => void remove(node) }
    ]
  }

  const onTreeKeyDown = (event: React.KeyboardEvent): void => {
    if (!selected || draft) return
    const node = findNode(children, selected)
    if (!node) return
    if (event.key === 'F2') {
      event.preventDefault()
      setDraft({ kind: 'rename', path: node.path, name: node.name })
    } else if (event.key === 'Delete') {
      event.preventDefault()
      void remove(node)
    }
  }

  if (!workspace) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <FolderOpen size={28} className="text-[var(--color-text-faint)]" aria-hidden />
        <p className="text-[12px] text-[var(--color-text-muted)]">No folder open.</p>
        <button type="button" className="lp-btn lp-btn-accent lp-btn-sm" onClick={() => void openWorkspace()}>
          Open Folder…
        </button>
      </div>
    )
  }

  const folderName = workspace.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? workspace

  const renderDraftInput = (depth: number, kind: Draft['kind'], initial = ''): React.JSX.Element => (
    <DraftInput
      key={`draft-${kind}`}
      depth={depth}
      dir={kind === 'new-folder'}
      initial={initial}
      onCommit={(v) => void commitDraft(v)}
      onCancel={() => setDraft(null)}
    />
  )

  const renderLevel = (dir: string, depth: number): React.JSX.Element[] => {
    const nodes = children[dir] ?? []
    const out: React.JSX.Element[] = []
    if (draft && draft.kind !== 'rename' && draft.parent === dir) out.push(renderDraftInput(depth, draft.kind))
    for (const node of nodes) {
      if (draft?.kind === 'rename' && draft.path === node.path) {
        out.push(renderDraftInput(depth, node.dir ? 'new-folder' : 'new-file', node.name))
        continue
      }
      const isOpen = Boolean(expanded[node.path])
      out.push(
        <button
          key={node.path}
          type="button"
          className={`lp-tree-row ${activePath === node.path ? 'is-active' : ''} ${selected === node.path ? 'is-selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          title={node.path}
          aria-expanded={node.dir ? isOpen : undefined}
          onClick={() => {
            setSelected(node.path)
            if (node.dir) toggle(node)
            else void openFile(node.path)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setSelected(node.path)
            setMenu({ x: e.clientX, y: e.clientY, node })
          }}
        >
          {node.dir ? (
            <CaretRight size={10} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
          ) : (
            <span className="w-[10px] shrink-0" />
          )}
          {node.dir ? (
            <FolderSimple
              size={14}
              weight={isOpen ? 'fill' : 'regular'}
              className="shrink-0 text-[var(--color-accent)] opacity-80"
              aria-hidden
            />
          ) : (
            <FileIcon name={node.name} />
          )}
          <span className="truncate">{node.name}</span>
        </button>
      )
      if (node.dir && isOpen) out.push(...renderLevel(node.path, depth + 1))
    }
    return out
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onTreeKeyDown}>
      <div className="lp-side-section-head group">
        <span className="truncate" title={workspace}>
          {folderName}
        </span>
        <div className="ml-auto flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
          <MiniButton label="New File" onClick={() => startCreate('new-file', findNode(children, selected ?? ''))}>
            <FilePlus size={14} />
          </MiniButton>
          <MiniButton label="New Folder" onClick={() => startCreate('new-folder', findNode(children, selected ?? ''))}>
            <FolderPlus size={14} />
          </MiniButton>
          <MiniButton label="Refresh Explorer" onClick={() => void refreshAll()}>
            <ArrowsClockwise size={14} />
          </MiniButton>
          <MiniButton label="Collapse Folders" onClick={() => setExpanded({})}>
            <MinusSquare size={14} />
          </MiniButton>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto pb-6"
        role="tree"
        aria-label="Files"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            setSelected(null)
            setMenu({ x: e.clientX, y: e.clientY, node: null })
          }
        }}
      >
        {renderLevel('', 0)}
        {(children[''] ?? []).length === 0 && !draft ? (
          <p className="px-4 py-3 text-[11px] text-[var(--color-text-faint)]">This folder is empty.</p>
        ) : null}
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  )
}

function findNode(map: Record<string, WorkspaceTreeNode[]>, path: string): WorkspaceTreeNode | null {
  if (!path) return null
  for (const list of Object.values(map)) {
    const hit = list.find((n) => n.path === path)
    if (hit) return hit
  }
  return null
}

function DraftInput({
  depth,
  dir,
  initial,
  onCommit,
  onCancel
}: {
  depth: number
  dir: boolean
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(ref.current?.value ?? '')
    else onCancel()
  }
  return (
    <div className="flex items-center gap-1 py-[2px] pr-2" style={{ paddingLeft: 8 + depth * 12 + 10 }}>
      {dir ? (
        <FolderSimple size={14} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
      ) : (
        <FileIcon name={initial || 'file'} />
      )}
      <input
        ref={ref}
        defaultValue={initial}
        aria-label={dir ? 'Folder name' : 'File name'}
        className="lp-tree-input"
        spellCheck={false}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') finish(true)
          else if (e.key === 'Escape') finish(false)
        }}
        onBlur={() => finish(true)}
      />
    </div>
  )
}

export function MiniButton({
  label,
  onClick,
  active,
  children
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`lp-mini-btn ${active ? 'is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
