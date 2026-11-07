import { Broom, CaretRight, Stop, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

interface Line {
  id: number
  kind: 'cmd' | 'stdout' | 'stderr' | 'info'
  text: string
}

interface TerminalState {
  lines: Line[]
  runningId: string | null
  history: string[]
  push: (kind: Line['kind'], text: string) => void
  clear: () => void
  setRunning: (id: string | null) => void
  remember: (command: string) => void
}

let lineSeq = 0
const MAX_LINES = 4000

/** Kept outside the component so output survives switching views. */
export const useTerminalStore = create<TerminalState>((set, get) => ({
  lines: [],
  runningId: null,
  history: [],
  push: (kind, text) => {
    const lines = get().lines
    const last = lines[lines.length - 1]
    // Merge stream chunks into the previous line block of the same kind.
    if (last && last.kind === kind && kind !== 'cmd') {
      const merged = [...lines.slice(0, -1), { ...last, text: last.text + text }]
      set({ lines: merged })
      return
    }
    set({ lines: [...lines, { id: ++lineSeq, kind, text }].slice(-MAX_LINES) })
  },
  clear: () => set({ lines: [] }),
  setRunning: (runningId) => set({ runningId }),
  remember: (command) =>
    set({ history: [command, ...get().history.filter((c) => c !== command)].slice(0, 100) })
}))

let listenersBound = false
function bindTerminalListeners(): void {
  if (listenersBound) return
  listenersBound = true
  window.localpilot.onTerminalData((event) => {
    if (event.id !== useTerminalStore.getState().runningId) return
    useTerminalStore.getState().push(event.stream, event.text)
  })
  window.localpilot.onTerminalExit((event) => {
    const state = useTerminalStore.getState()
    if (event.id !== state.runningId) return
    state.push('info', `\n[exited with code ${event.code ?? 'signal'}]\n`)
    state.setRunning(null)
  })
}

/** Run a command in the terminal panel (also used by editor actions like "Run file"). */
export async function runInTerminal(command: string): Promise<void> {
  bindTerminalListeners()
  const state = useTerminalStore.getState()
  if (state.runningId) {
    state.push('info', '[a command is still running — stop it first]\n')
    return
  }
  state.remember(command)
  state.push('cmd', command)
  const result = await window.localpilot.runTerminal(command)
  if (!result.ok || !result.id) {
    state.push('stderr', `${result.error ?? 'Could not start command'}\n`)
    return
  }
  state.setRunning(result.id)
}

export function TerminalPanel({ onClose, cwdLabel }: { onClose: () => void; cwdLabel: string }): React.JSX.Element {
  const { lines, runningId, history, clear, push } = useTerminalStore()
  const [input, setInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const stick = useRef(true)

  useEffect(() => bindTerminalListeners(), [])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const submit = async (): Promise<void> => {
    const text = input
    setInput('')
    setHistoryIndex(-1)
    if (runningId) {
      // A process is running: the line goes to its stdin.
      push('stdout', `${text}\n`)
      await window.localpilot.writeTerminal(runningId, `${text}\n`)
      return
    }
    const command = text.trim()
    if (!command) return
    if (command === 'clear' || command === 'cls') {
      clear()
      return
    }
    await runInTerminal(command)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    } else if (event.key === 'ArrowUp' && !runningId) {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      if (next >= 0) {
        setHistoryIndex(next)
        setInput(history[next] ?? '')
      }
    } else if (event.key === 'ArrowDown' && !runningId) {
      event.preventDefault()
      const next = historyIndex - 1
      setHistoryIndex(Math.max(next, -1))
      setInput(next >= 0 ? (history[next] ?? '') : '')
    } else if (event.key === 'c' && event.ctrlKey && runningId && !window.getSelection()?.toString()) {
      event.preventDefault()
      void window.localpilot.killTerminal(runningId)
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault()
      clear()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]" onClick={() => inputRef.current?.focus()}>
      <div className="lp-panel-head">
        <span className="lp-panel-tab is-active">Terminal</span>
        <span className="truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-faint)]">{cwdLabel}</span>
        {runningId ? <span className="lp-live-dot" aria-label="Running" /> : null}
        <div className="ml-auto flex items-center gap-0.5">
          {runningId ? (
            <button type="button" className="lp-mini-btn" title="Stop (Ctrl+C)" aria-label="Stop" onClick={() => void window.localpilot.killTerminal(runningId)}>
              <Stop size={13} weight="fill" className="text-[var(--color-danger)]" />
            </button>
          ) : null}
          <button type="button" className="lp-mini-btn" title="Clear (Ctrl+L)" aria-label="Clear terminal" onClick={clear}>
            <Broom size={13} />
          </button>
          <button type="button" className="lp-mini-btn" title="Close panel (Ctrl+`)" aria-label="Close panel" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-[var(--font-mono)] text-[12px] leading-[18px]"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        role="log"
        aria-live="off"
      >
        {lines.length === 0 ? (
          <p className="text-[var(--color-text-faint)]">
            Runs commands in the open folder. Output streams live; type while a command runs to send input.
          </p>
        ) : null}
        {lines.map((line) =>
          line.kind === 'cmd' ? (
            <div key={line.id} className="mt-1 flex items-center gap-1 text-[var(--color-accent)]">
              <CaretRight size={11} weight="bold" aria-hidden />
              <span className="text-[var(--color-text)]">{line.text}</span>
            </div>
          ) : (
            <pre
              key={line.id}
              className={`m-0 whitespace-pre-wrap break-words ${
                line.kind === 'stderr'
                  ? 'text-[#f0a3a3]'
                  : line.kind === 'info'
                    ? 'text-[var(--color-text-faint)]'
                    : 'text-[var(--color-text-muted)]'
              }`}
            >
              {line.text}
            </pre>
          )
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-[var(--color-border)] px-3 py-1.5">
        <CaretRight size={12} weight="bold" className={runningId ? 'text-[var(--color-text-faint)]' : 'text-[var(--color-accent)]'} aria-hidden />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          aria-label={runningId ? 'Send input to running process' : 'Terminal command'}
          placeholder={runningId ? 'stdin…' : 'npm test, git status, python main.py…'}
          className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>
    </div>
  )
}
