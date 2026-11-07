import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChatCircle,
  Code,
  Cpu,
  FolderOpen,
  Lightning,
  Gear,
  Graph,
  Plus,
  SidebarSimple,
  Stop,
  SquaresFour
} from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'
import { Dialog } from './ui/Dialog'
import { Kbd } from './ui/Kbd'

interface Command {
  id: string
  label: string
  hint?: string
  keys?: string
  icon: ReactNode
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  onToggleSidebar,
  onToggleInspector
}: {
  open: boolean
  onClose: () => void
  onToggleSidebar: () => void
  onToggleInspector: () => void
}): React.JSX.Element | null {
  const setView = useAppStore((s) => s.setView)
  const newTask = useAppStore((s) => s.newTask)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const stopAllAgents = useAppStore((s) => s.stopAllAgents)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = useMemo<Command[]>(() => {
    const wrap = (fn: () => void) => () => {
      onClose()
      fn()
    }
    return [
      {
        id: 'new-chat',
        label: 'New chat',
        keys: 'Mod+N',
        icon: <Plus size={14} weight="bold" aria-hidden />,
        run: wrap(() => newTask())
      },
      {
        id: 'chat',
        label: 'Go to Chat',
        keys: 'Mod+1',
        icon: <ChatCircle size={14} aria-hidden />,
        run: wrap(() => setView('chat'))
      },
      {
        id: 'code',
        label: 'Open Code editor',
        hint: 'Files, AI edits, terminal',
        keys: 'Mod+2',
        icon: <Code size={14} aria-hidden />,
        run: wrap(() => setView('code'))
      },
      {
        id: 'flow',
        label: 'Open Flow Engine',
        keys: 'Mod+3',
        icon: <Graph size={14} aria-hidden />,
        run: wrap(() => setView('workflow'))
      },
      {
        id: 'arena',
        label: 'Open Model Arena',
        hint: 'Compare models side by side',
        keys: 'Mod+4',
        icon: <Lightning size={14} aria-hidden />,
        run: wrap(() => setView('arena'))
      },
      {
        id: 'settings',
        label: 'Open Settings',
        keys: 'Mod+,',
        icon: <Gear size={14} aria-hidden />,
        run: wrap(() => setView('settings'))
      },
      {
        id: 'providers',
        label: 'Add a model provider / API key',
        hint: 'Free, local, or paid',
        icon: <Cpu size={14} aria-hidden />,
        run: wrap(() => setView('settings'))
      },
      {
        id: 'open-folder',
        label: 'Open Folder…',
        hint: 'Set the Agent workspace',
        icon: <FolderOpen size={14} aria-hidden />,
        run: wrap(() => void openWorkspace())
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle session list',
        keys: 'Mod+B',
        icon: <SidebarSimple size={14} aria-hidden />,
        run: wrap(onToggleSidebar)
      },
      {
        id: 'toggle-inspector',
        label: 'Toggle inspector',
        keys: 'Mod+J',
        icon: <SquaresFour size={14} aria-hidden />,
        run: wrap(onToggleInspector)
      },
      {
        id: 'stop-all',
        label: 'Stop all agents',
        hint: 'Kill switch: Mod+Shift+.',
        icon: <Stop size={14} weight="fill" aria-hidden />,
        run: wrap(() => void stopAllAgents())
      }
    ]
  }, [onClose, newTask, setView, openWorkspace, stopAllAgents, onToggleSidebar, onToggleInspector])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(filtered.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      filtered[active]?.run()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="lp-palette-title" className="!p-0 max-w-[560px] !rounded-[var(--radius-lg)]">
      <div className="lp-palette !relative !translate-x-0 !shadow-none !border-0 !bg-transparent !rounded-none">
        <h2 id="lp-palette-title" className="sr-only">
          Command palette
        </h2>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          aria-label="Command"
          className="lp-palette-input"
        />
        <ul ref={listRef} className="lp-palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-[12px] text-[var(--color-text-faint)]">No matching commands.</li>
          ) : (
            filtered.map((command, index) => (
              <li key={command.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  data-active={index === active}
                  className="lp-palette-item"
                  onMouseEnter={() => setActive(index)}
                  onClick={command.run}
                >
                  <span className="text-[var(--color-text-faint)]">{command.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? (
                    <span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">
                      {command.hint}
                    </span>
                  ) : null}
                  {command.keys ? <Kbd keys={command.keys} /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  )
}
