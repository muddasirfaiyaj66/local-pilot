import { ChatCircle, Code, Columns, Gear, Graph, Lightning, Stop } from '@phosphor-icons/react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { useAppStore } from './store/appStore'
import { SettingsPage } from './pages/SettingsPage'
import { WorkflowPage } from './workflow/WorkflowPage'
import { ArenaPage } from './arena/ArenaPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TaskSidebar } from './components/TaskSidebar'
import { MessageList } from './components/MessageList'
import { LivePreviewPane } from './components/LivePreviewPane'
import { Composer } from './components/Composer'
import { PermissionModal } from './components/PermissionModal'
import { DiffReviewPane } from './components/DiffReviewPane'
import { WorkspaceBanner, WorkspaceChip } from './components/WorkspaceBar'
import { CommandPalette } from './components/CommandPalette'
import { StatusBar } from './components/StatusBar'
import { IconButton } from './components/ui/IconButton'
import { usePersistentState } from './hooks/usePersistentState'
import { useResizable } from './hooks/useResizable'
import logoMark from './assets/logo-mark.svg'

// Monaco is large; load the Code view on first use.
const IdePage = lazy(() => import('./ide/IdePage').then((m) => ({ default: m.IdePage })))

function ResizeHandle({
  onPointerDown,
  dragging,
  side
}: {
  onPointerDown: (e: React.PointerEvent) => void
  dragging: boolean
  side: 'left' | 'right'
}): React.JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={`lp-resize-handle ${dragging ? 'is-dragging' : ''}`}
      style={side === 'left' ? { left: '-3px' } : { right: '-3px' }}
      onPointerDown={onPointerDown}
    />
  )
}

export default function App(): React.JSX.Element {
  const ready = useAppStore((s) => s.ready)
  const view = useAppStore((s) => s.view)
  const init = useAppStore((s) => s.init)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const attachments = useAppStore((s) => s.attachments)
  const interactionMode = useAppStore((s) => s.interactionMode)
  const setView = useAppStore((s) => s.setView)
  const timeline = useAppStore((s) => s.timeline)
  const maxSteps = useAppStore((s) => s.settings?.maxAgentSteps ?? 60)
  const newTask = useAppStore((s) => s.newTask)
  const [draft, setDraft] = useState('')
  const viewRef = useRef(view)
  viewRef.current = view
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [sidebarOpen, setSidebarOpen] = usePersistentState('lp.pane.sidebarOpen', true)
  const [inspectorOpen, setInspectorOpen] = usePersistentState('lp.pane.inspectorOpen', true)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const sidebar = useResizable({ key: 'lp.pane.sidebar', initial: 240, min: 180, max: 400 })
  const inspector = useResizable({
    key: 'lp.pane.inspector',
    initial: 300,
    min: 220,
    max: 560,
    invert: true
  })

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), [setSidebarOpen])
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), [setInspectorOpen])

  const composerInsert = useAppStore((s) => s.composerInsert)
  const clearComposerInsert = useAppStore((s) => s.clearComposerInsert)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!composerInsert) return
    setDraft((prev) =>
      prev && !/\s$/.test(prev) ? `${prev} ${composerInsert}` : `${prev}${composerInsert}`
    )
    clearComposerInsert()
  }, [composerInsert, clearComposerInsert])

  useEffect(() => {
    if (ready && view === 'chat') inputRef.current?.focus()
  }, [ready, view])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'k' || (event.shiftKey && key === 'p')) {
        event.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (event.key === ',') {
        event.preventDefault()
        setView('settings')
      } else if (event.key === '1') {
        event.preventDefault()
        setView('chat')
      } else if (event.key === '2') {
        event.preventDefault()
        setView('code')
      } else if (event.key === '3') {
        event.preventDefault()
        setView('workflow')
      } else if (event.key === '4') {
        event.preventDefault()
        setView('arena')
      } else if (viewRef.current !== 'chat') {
        // The Code view owns Ctrl+B/J/N etc. while it is showing.
        return
      } else if (key === 'n') {
        event.preventDefault()
        newTask()
      } else if (key === 'b') {
        event.preventDefault()
        toggleSidebar()
      } else if (key === 'j') {
        event.preventDefault()
        toggleInspector()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newTask, setView, toggleSidebar, toggleInspector])

  const submit = (): void => {
    if ((!draft.trim() && attachments.length === 0) || isStreaming) return
    const text = draft
    setDraft('')
    void sendMessage(text)
  }

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    submit()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  if (!ready) {
    return (
      <div
        className="flex h-full items-center justify-center text-[var(--color-text-muted)]"
        role="status"
      >
        <img src={logoMark} alt="" width={24} height={24} className="mr-2 rounded-[5px]" />
        Starting LocalPilot…
      </div>
    )
  }

  const modeLabel =
    interactionMode === 'plan' ? 'Plan' : interactionMode === 'agent' ? 'Agent' : 'Chat'
  const toolSteps = timeline.filter((entry) => entry.kind === 'tool')
  const statusLine = isStreaming
    ? `${toolSteps[toolSteps.length - 1]?.text.split(' ')[0] ?? 'Thinking'} · step ${toolSteps.length}/${maxSteps}`
    : null

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <nav className="lp-rail" aria-label="Primary">
        <img
          src={logoMark}
          alt="LocalPilot"
          width={22}
          height={22}
          className="mb-2 rounded-[5px]"
          title="LocalPilot"
        />
        <RailButton label="Chat" keys="Ctrl/Cmd+1" active={view === 'chat'} onClick={() => setView('chat')}>
          <ChatCircle size={18} weight={view === 'chat' ? 'fill' : 'regular'} aria-hidden />
        </RailButton>
        <RailButton label="Code" keys="Ctrl/Cmd+2" active={view === 'code'} onClick={() => setView('code')}>
          <Code size={18} weight={view === 'code' ? 'bold' : 'regular'} aria-hidden />
        </RailButton>
        <RailButton label="Flow Engine" keys="Ctrl/Cmd+3" active={view === 'workflow'} onClick={() => setView('workflow')}>
          <Graph size={18} weight={view === 'workflow' ? 'fill' : 'regular'} aria-hidden />
        </RailButton>
        <RailButton label="Model Arena" keys="Ctrl/Cmd+4" active={view === 'arena'} onClick={() => setView('arena')}>
          <Lightning size={18} weight={view === 'arena' ? 'fill' : 'regular'} aria-hidden />
        </RailButton>
        <div className="flex-1" />
        <RailButton label="Settings" keys="Ctrl/Cmd+," active={view === 'settings'} onClick={() => setView('settings')}>
          <Gear size={18} weight={view === 'settings' ? 'fill' : 'regular'} aria-hidden />
        </RailButton>
      </nav>

      {view === 'workflow' ? (
        <WorkflowPage />
      ) : view === 'code' ? (
        <ErrorBoundary>
          <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[12px] text-[var(--color-text-faint)]">Loading editor…</div>}>
            <IdePage />
          </Suspense>
        </ErrorBoundary>
      ) : view === 'arena' ? (
        <ArenaPage />
      ) : view === 'settings' ? (
        <SettingsPage />
      ) : (
        <>
          {sidebarOpen ? (
            <div className="lp-pane-session relative flex shrink-0" style={{ width: sidebar.width }}>
              <TaskSidebar />
              <ResizeHandle
                onPointerDown={sidebar.onHandlePointerDown}
                dragging={sidebar.dragging}
                side="right"
              />
            </div>
          ) : null}

          <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
            <div className="lp-titlebar">
              <img src={logoMark} alt="" width={14} height={14} className="rounded-[2px]" />
              <span className="text-[12px] font-medium tracking-tight text-[var(--color-text)]">
                LocalPilot
              </span>
              <span className={interactionMode === 'agent' ? 'lp-mode-pill is-agent' : 'lp-mode-pill'}>
                {modeLabel}
              </span>
              {statusLine ? (
                <span className="truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">
                  {statusLine}
                </span>
              ) : null}
              <div className="flex-1" />
              <IconButton
                label={sidebarOpen ? 'Hide session list' : 'Show session list'}
                aria-pressed={sidebarOpen}
                className="!h-6 !w-6"
                onClick={toggleSidebar}
              >
                <Columns size={13} aria-hidden />
              </IconButton>
              <WorkspaceChip />
              <IconButton
                label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                aria-pressed={inspectorOpen}
                className="!h-6 !w-6"
                onClick={toggleInspector}
              >
                <Stop size={13} aria-hidden className="rotate-90" />
              </IconButton>
            </div>
            <WorkspaceBanner />
            <div className="flex min-h-0 flex-1 flex-col">
              <MessageList />
              <DiffReviewPane />
              <Composer
                draft={draft}
                setDraft={setDraft}
                inputRef={inputRef}
                onSubmit={onSubmit}
                onKeyDown={onKeyDown}
                canSend={(Boolean(draft.trim()) || attachments.length > 0) && !isStreaming}
              />
            </div>
            <StatusBar />
          </main>

          {inspectorOpen ? (
            <div className="lp-pane-inspector relative flex shrink-0" style={{ width: inspector.width }}>
              <ResizeHandle
                onPointerDown={inspector.onHandlePointerDown}
                dragging={inspector.dragging}
                side="left"
              />
              <LivePreviewPane />
            </div>
          ) : null}
        </>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggleSidebar={toggleSidebar}
        onToggleInspector={toggleInspector}
      />
      <PermissionModal />
    </div>
  )
}

function RailButton({
  label,
  keys,
  active,
  onClick,
  children
}: {
  label: string
  keys: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="lp-rail-btn"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      title={`${label} (${keys})`}
    >
      {children}
    </button>
  )
}
