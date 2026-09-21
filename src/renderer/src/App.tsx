import { ChatCircle, Gear } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAppStore } from './store/appStore'
import { SettingsPage } from './pages/SettingsPage'
import { TaskSidebar } from './components/TaskSidebar'
import { MessageList } from './components/MessageList'
import { LivePreviewPane } from './components/LivePreviewPane'
import { Composer } from './components/Composer'
import { PermissionModal } from './components/PermissionModal'
import { DiffReviewPane } from './components/DiffReviewPane'
import logoMark from './assets/logo-mark.svg'

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
        <img src={logoMark} alt="" width={28} height={28} className="mr-2 rounded-[6px]" />
        Starting LocalPilot…
      </div>
    )
  }

  const modeLabel =
    interactionMode === 'plan' ? 'Plan' : interactionMode === 'agent' ? 'Agent' : 'Chat'

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <nav
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border)] bg-[var(--color-bg)] py-2"
        aria-label="Primary"
      >
        <img
          src={logoMark}
          alt="LocalPilot"
          width={26}
          height={26}
          className="mb-2 rounded-[6px]"
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
          <ChatCircle size={18} weight={view === 'chat' ? 'fill' : 'regular'} aria-hidden />
        </button>
        <button
          type="button"
          className="lp-icon-btn"
          aria-label="Settings"
          aria-pressed={view === 'settings'}
          onClick={() => setView('settings')}
          title="Settings"
        >
          <Gear size={18} weight={view === 'settings' ? 'fill' : 'regular'} aria-hidden />
        </button>
      </nav>

      {view === 'settings' ? (
        <SettingsPage />
      ) : (
        <>
          <TaskSidebar />
          <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
              <img src={logoMark} alt="" width={16} height={16} className="rounded-[3px]" />
              <span className="text-[12px] font-medium text-[var(--color-text)]">LocalPilot</span>
              <span className="text-[var(--color-text-faint)]">·</span>
              <span className="text-[12px] text-[var(--color-text-muted)]">{modeLabel}</span>
            </div>
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
          </main>
          <LivePreviewPane />
        </>
      )}
      <PermissionModal />
    </div>
  )
}
