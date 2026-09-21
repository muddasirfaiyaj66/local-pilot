import { ChatCircle, Gear, Stop } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAppStore } from './store/appStore'
import { SettingsPage } from './pages/SettingsPage'
import { TaskSidebar } from './components/TaskSidebar'
import { MessageList } from './components/MessageList'
import { LivePreviewPane } from './components/LivePreviewPane'
import { Composer } from './components/Composer'
import { PermissionModal } from './components/PermissionModal'
import { DiffReviewPane } from './components/DiffReviewPane'
import { WorkspaceBanner, WorkspaceChip } from './components/WorkspaceBar'
import logoMark from './assets/logo-mark.svg'

function RunningServersChip(): React.JSX.Element | null {
  const processes = useAppStore((s) => s.processes)
  const stopProcess = useAppStore((s) => s.stopProcess)
  const running = processes.filter((p) => p.running)
  if (running.length === 0) return null
  const first = running[0]!
  const port = first.url?.match(/:(\d+)/)?.[1]
  return (
    <span className="flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] pl-1.5 text-[10px] text-[var(--color-text-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" aria-hidden />
      <span className="font-[var(--font-mono)]" title={running.map((p) => p.command).join('\n')}>
        {port ? `:${port}` : 'server'}
        {running.length > 1 ? ` +${running.length - 1}` : ''}
      </span>
      <button
        type="button"
        className="lp-icon-btn !h-5 !w-5"
        aria-label="Stop server"
        title={`Stop ${first.command}`}
        onClick={() => void stopProcess(first.id)}
      >
        <Stop size={9} weight="fill" className="text-[var(--color-danger)]" aria-hidden />
      </button>
    </span>
  )
}

function RunningAgentsBadge(): React.JSX.Element | null {
  const sessions = useAppStore((s) => s.sessions)
  const n = Object.values(sessions).filter((s) => s.run.isStreaming).length
  if (n < 2) return null
  return (
    <span className="rounded bg-[var(--color-accent)]/15 px-1.5 py-px text-[10px] font-medium tabular-nums text-[var(--color-accent)]">
      {n} agents
    </span>
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
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (ready && view === 'chat') inputRef.current?.focus()
  }, [ready, view])

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

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
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

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <nav className="lp-rail" aria-label="Primary">
        <img
          src={logoMark}
          alt="LocalPilot"
          width={22}
          height={22}
          className="mb-1.5 rounded-[5px]"
          title="LocalPilot"
        />
        <button
          type="button"
          className="lp-icon-btn"
          aria-label="Chat"
          aria-pressed={view === 'chat'}
          onClick={() => setView('chat')}
          title="Chat"
        >
          <ChatCircle size={17} weight={view === 'chat' ? 'fill' : 'regular'} aria-hidden />
        </button>
        <button
          type="button"
          className="lp-icon-btn"
          aria-label="Settings"
          aria-pressed={view === 'settings'}
          onClick={() => setView('settings')}
          title="Settings"
        >
          <Gear size={17} weight={view === 'settings' ? 'fill' : 'regular'} aria-hidden />
        </button>
      </nav>

      {view === 'settings' ? (
        <SettingsPage />
      ) : (
        <>
          <TaskSidebar />
          <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
            <div className="lp-titlebar">
              <img src={logoMark} alt="" width={14} height={14} className="rounded-[2px]" />
              <span className="text-[12px] font-medium tracking-tight text-[var(--color-text)]">
                LocalPilot
              </span>
              <span
                className={
                  interactionMode === 'agent' ? 'lp-mode-pill is-agent' : 'lp-mode-pill'
                }
              >
                {modeLabel}
              </span>
              <RunningAgentsBadge />
              <div className="flex-1" />
              <RunningServersChip />
              <WorkspaceChip />
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
          </main>
          <LivePreviewPane />
        </>
      )}
      <PermissionModal />
    </div>
  )
}
