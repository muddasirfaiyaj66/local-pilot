import { CircleNotch, Plus, Stop, Trash } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'

export function TaskSidebar(): React.JSX.Element {
  const tasks = useAppStore((s) => s.tasks)
  const sessions = useAppStore((s) => s.sessions)
  const activeTaskId = useAppStore((s) => s.activeTaskId)
  const newTask = useAppStore((s) => s.newTask)
  const selectTask = useAppStore((s) => s.selectTask)
  const deleteTask = useAppStore((s) => s.deleteTask)
  const stopTask = useAppStore((s) => s.stopTask)
  const stopAllAgents = useAppStore((s) => s.stopAllAgents)
  const runningCount = Object.values(sessions).filter((s) => s.run.isStreaming).length

  return (
    <aside
      className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label="Chat history"
    >
      <div className="flex h-9 items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          Chats
          {runningCount > 0 ? (
            <span className="ml-1.5 normal-case tracking-normal text-[var(--color-accent)]">
              · {runningCount} running
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-0.5">
          {runningCount > 1 ? (
            <button
              type="button"
              onClick={() => void stopAllAgents()}
              className="lp-icon-btn"
              aria-label="Stop all agents"
              title="Stop all agents"
            >
              <Stop size={12} weight="fill" className="text-[var(--color-danger)]" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={newTask}
            className="lp-icon-btn"
            aria-label="New chat"
            title="New chat — run another agent in parallel"
          >
            <Plus size={14} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto px-1.5 pb-2">
        {tasks.map((task) => {
          const active = task.id === activeTaskId
          const run = sessions[task.id]?.run
          const running = Boolean(run?.isStreaming)
          const needsApproval = Boolean(run?.pendingPermission)
          return (
            <li key={task.id} className="group relative">
              <button
                type="button"
                onClick={() => selectTask(task.id)}
                aria-current={active ? 'true' : undefined}
                className={`mb-0.5 w-full rounded-md py-1.5 pr-14 pl-2.5 text-left transition-colors duration-100 ${
                  active
                    ? 'bg-[var(--color-hover)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {running ? (
                    <CircleNotch
                      size={12}
                      className="shrink-0 text-[var(--color-accent)] motion-safe:animate-spin"
                      aria-label="Running"
                    />
                  ) : needsApproval ? (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warn)]"
                      title="Needs approval"
                    />
                  ) : null}
                  <span className="truncate text-[13px]">{task.title}</span>
                </div>
              </button>
              <div className="absolute top-0.5 right-0.5 flex items-center">
                {running ? (
                  <button
                    type="button"
                    className="lp-icon-btn !h-6 !w-6"
                    aria-label={`Stop ${task.title}`}
                    title="Stop this agent"
                    onClick={(e) => {
                      e.stopPropagation()
                      void stopTask(task.id)
                    }}
                  >
                    <Stop size={11} weight="fill" className="text-[var(--color-danger)]" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="lp-icon-btn !h-6 !w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${task.title}`}
                  title="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTask(task.id)
                  }}
                >
                  <Trash size={12} aria-hidden />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="border-t border-[var(--color-border)] px-3 py-2 text-[10px] leading-snug text-[var(--color-text-faint)]">
        Open a new chat to run another agent while others keep working.
      </p>
    </aside>
  )
}
