import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { killProcessTree } from './tools/shell'

export interface TerminalSink {
  data: (id: string, stream: 'stdout' | 'stderr', text: string) => void
  exit: (id: string, code: number | null) => void
}

const running = new Map<string, ChildProcess>()

/**
 * Run one command line for the IDE terminal panel. There is no PTY (no native
 * module), so full-screen TUIs won't render, but output streams live, stdin
 * can be written, and Stop kills the whole process tree.
 */
export function runTerminalCommand(command: string, cwd: string, sink: TerminalSink): string {
  const id = randomUUID()
  const isWin = process.platform === 'win32'
  const child = spawn(isWin ? 'cmd.exe' : process.env.SHELL || 'bash', isWin ? ['/d', '/s', '/c', command] : ['-lc', command], {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(isWin ? { windowsVerbatimArguments: true } : {})
  })
  running.set(id, child)
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (text: string) => sink.data(id, 'stdout', text))
  child.stderr?.on('data', (text: string) => sink.data(id, 'stderr', text))
  child.on('error', (err) => {
    sink.data(id, 'stderr', `${err.message}\n`)
  })
  child.on('close', (code) => {
    running.delete(id)
    sink.exit(id, code)
  })
  return id
}

export function writeTerminalInput(id: string, text: string): boolean {
  const child = running.get(id)
  if (!child?.stdin || child.stdin.destroyed) return false
  child.stdin.write(text)
  return true
}

export function killTerminal(id: string): boolean {
  const child = running.get(id)
  if (!child) return false
  killProcessTree(child)
  return true
}

export function killAllTerminals(): void {
  for (const child of running.values()) killProcessTree(child)
  running.clear()
}
