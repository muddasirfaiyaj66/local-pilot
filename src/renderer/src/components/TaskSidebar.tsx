import { Plus, Trash } from '@phosphor-icons/react'
import { useAppStore } from '../store/appStore'

export function TaskSidebar(): React.JSX.Element {
  const tasks = useAppStore((s) => s.tasks)
  const activeTaskId = useAppStore((s) => s.activeTaskId)
  const newTask = useAppStore((s) => s.newTask)
  const selectTask = useAppStore((s) => s.selectTask)
  const deleteTask = useAppStore((s) => s.deleteTask)

  return (
    <aside
      className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label="Chat history"
    >
      <div className="flex h-9 items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          Chats
        </span>
        <button
          type="button"
          onClick={newTask}
          className="lp-icon-btn"
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={14} weight="bold" aria-hidden />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-1.5 pb-2">
        {tasks.map((task) => {
          const active = task.id === activeTaskId
          return (
            <li key={task.id} className="group relative">
              <button
                type="button"
                onClick={() => selectTask(task.id)}
                aria-current={active ? 'true' : undefined}
                className={`mb-0.5 w-full rounded-md py-1.5 pr-8 pl-2.5 text-left transition-colors duration-100 ${
                  active
                    ? 'bg-[var(--color-hover)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                <div className="truncate text-[13px]">{task.title}</div>
              </button>
              <button
                type="button"
                className="lp-icon-btn absolute top-0.5 right-0.5 !h-6 !w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label={`Delete ${task.title}`}
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteTask(task.id)
                }}
              >
                <Trash size={12} aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
