import { spawn, type ChildProcess } from 'node:child_process'
import { z } from 'zod'
import { isDeniedCommand, spawnShell } from './shell'
import { errResult, okResult, type RegisteredTool } from './types'
import { resolveInWorkspace, WorkspaceError } from './workspace'

interface ManagedProcess {
  id: string
  command: string
  cwd: string
  child: ChildProcess
  logs: string
  url: string | null
  exitCode: number | null
  startedAt: number
}

const MAX_LOG_CHARS = 60_000
const processes = new Map<string, ManagedProcess>()
let counter = 0

const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s'"<>]*)/i

function detectUrl(text: string): string | null {
  const match = URL_RE.exec(text)
  if (!match) return null
  return match[1]!.replace(/[.,)]+$/, '').replace('0.0.0.0', 'localhost')
}

function appendLog(proc: ManagedProcess, chunk: string): void {
  proc.logs = (proc.logs + chunk).slice(-MAX_LOG_CHARS)
  if (!proc.url) proc.url = detectUrl(proc.logs)
}

function tailOf(text: string, lines: number): string {
  const all = text.split(/\r?\n/)
  return all.slice(-lines).join('\n').trim() || '(no output yet)'
}

export function stopAllProcesses(): void {
  for (const proc of processes.values()) {
    try {
      killTree(proc)
    } catch {
      /* best effort */
    }
  }
  processes.clear()
}

function killTree(proc: ManagedProcess): void {
  if (proc.child.exitCode !== null || proc.child.killed) return
  if (process.platform === 'win32' && proc.child.pid) {
    spawn('taskkill', ['/pid', String(proc.child.pid), '/t', '/f'], { windowsHide: true })
  } else {
    proc.child.kill('SIGTERM')
  }
}

const StartArgs = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  /** How long to watch startup output before returning (default 25s). */
  waitMs: z.number().int().positive().max(120_000).optional(),
  /** Kill an existing identical process first instead of reusing it. */
  restart: z.boolean().optional()
})

export interface ProcessInfo {
  id: string
  command: string
  cwd: string
  url: string | null
  running: boolean
  startedAt: number
}

function toInfo(proc: ManagedProcess): ProcessInfo {
  return {
    id: proc.id,
    command: proc.command,
    cwd: proc.cwd,
    url: proc.url,
    running: proc.exitCode === null,
    startedAt: proc.startedAt
  }
}

export function listProcesses(): ProcessInfo[] {
  return [...processes.values()].map(toInfo)
}

export function stopProcess(id: string): boolean {
  const proc = processes.get(id)
  if (!proc) return false
  killTree(proc)
  processes.delete(id)
  return true
}

/** Same command in the same folder: reuse it so dev servers stop hopping ports. */
function findRunning(command: string, cwd: string): ManagedProcess | undefined {
  const key = command.trim().toLowerCase()
  return [...processes.values()].find(
    (p) => p.exitCode === null && p.cwd === cwd && p.command.trim().toLowerCase() === key
  )
}

const LogsArgs = z.object({
  id: z.string().optional(),
  lines: z.number().int().positive().max(400).optional()
})

const StopArgs = z.object({ id: z.string().optional() })

export const processTools: RegisteredTool[] = [
  {
    name: 'proc_start',
    description:
      'Start a long-running command (dev server, watcher) in the background and return startup logs plus any detected http://localhost URL. Use for `npm run dev`, `npm start`, `vite`. If the same command is already running in that folder it is reused (same port) — pass restart:true to force a fresh one. Commands must be non-interactive. Use shell_run for commands that finish, such as `npm install`.',
    risk: 'risky',
    timeoutMs: 130_000,
    parameters: StartArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string', description: 'Working directory (defaults to workspace)' },
        waitMs: { type: 'number', description: 'Startup watch window in ms (default 25000)' },
        restart: { type: 'boolean', description: 'Restart instead of reusing a running process' }
      },
      required: ['command']
    },
    preview: (a) => `Start background process: ${String(a.command ?? '')}\ncwd: ${String(a.cwd ?? '(workspace)')}`,
    execute: async (raw, ctx) => {
      try {
        const args = StartArgs.parse(raw)
        if (isDeniedCommand(args.command)) {
          return errResult('Command blocked by deny list (destructive pattern)')
        }

        let cwd: string
        try {
          cwd = resolveInWorkspace(ctx.workspacePath, args.cwd ?? '.', ctx.allowOutsideWorkspace)
        } catch (err) {
          if (err instanceof WorkspaceError) return errResult(err.message)
          throw err
        }

        const existing = findRunning(args.command, cwd)
        if (existing && !args.restart) {
          return okResult(
            `Already running (${existing.id})${existing.url ? ` at ${existing.url}` : ''} — reusing it.\n\n${tailOf(existing.logs, 20)}`,
            {
              processId: existing.id,
              previewUrl: existing.url ?? undefined,
              running: true,
              reused: true
            }
          )
        }
        if (existing) stopProcess(existing.id)

        counter += 1
        const id = `p${counter}`
        const child = spawnShell(args.command, {
          cwd,
          extraEnv: { FORCE_COLOR: '0', NO_COLOR: '1' }
        })

        const proc: ManagedProcess = {
          id,
          command: args.command,
          cwd,
          child,
          logs: '',
          url: null,
          exitCode: null,
          startedAt: Date.now()
        }
        processes.set(id, proc)

        child.stdout?.on('data', (c: Buffer) => appendLog(proc, c.toString('utf8')))
        child.stderr?.on('data', (c: Buffer) => appendLog(proc, c.toString('utf8')))
        child.on('error', (err) => appendLog(proc, `\n[spawn error] ${err.message}\n`))
        child.on('close', (code) => {
          proc.exitCode = code
          appendLog(proc, `\n[process exited with code ${code ?? '?'}]\n`)
        })

        const waitMs = args.waitMs ?? 25_000
        const deadline = Date.now() + waitMs
        while (Date.now() < deadline) {
          if (ctx.signal?.aborted) break
          if (proc.url || proc.exitCode !== null) break
          await new Promise((r) => setTimeout(r, 300))
        }

        if (proc.exitCode !== null && proc.exitCode !== 0) {
          processes.delete(id)
          return errResult(
            `Process exited with code ${proc.exitCode}`,
            tailOf(proc.logs, 40)
          )
        }

        const status = proc.url
          ? `Running (${id}) at ${proc.url}`
          : proc.exitCode === 0
            ? `Finished (exit 0)`
            : `Running (${id}) — no URL detected yet`

        return okResult(`${status}\n\n${tailOf(proc.logs, 30)}`, {
          processId: id,
          previewUrl: proc.url ?? undefined,
          running: proc.exitCode === null
        })
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'proc_logs',
    description:
      'Read recent output from a background process started with proc_start. Use this to check whether a dev server compiled or crashed.',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: LogsArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Process id (defaults to the most recent)' },
        lines: { type: 'number', description: 'Tail line count (default 40)' }
      }
    },
    preview: (a) => `Read logs for ${String(a.id ?? '(latest process)')}`,
    execute: async (raw) => {
      const args = LogsArgs.parse(raw)
      const proc = args.id ? processes.get(args.id) : [...processes.values()].pop()
      if (!proc) return errResult('No background process found')
      const state = proc.exitCode === null ? 'running' : `exited (${proc.exitCode})`
      return okResult(
        `${proc.id} ${state}${proc.url ? ` — ${proc.url}` : ''}\n\n${tailOf(proc.logs, args.lines ?? 40)}`,
        { processId: proc.id, previewUrl: proc.url ?? undefined, running: proc.exitCode === null }
      )
    }
  },
  {
    name: 'proc_stop',
    description: 'Stop a background process started with proc_start (omit id to stop all).',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: StopArgs,
    jsonSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Process id; omit to stop all' } }
    },
    preview: (a) => `Stop background process ${String(a.id ?? '(all)')}`,
    execute: async (raw) => {
      const args = StopArgs.parse(raw)
      if (!args.id) {
        const n = processes.size
        stopAllProcesses()
        return okResult(`Stopped ${n} process(es)`)
      }
      return stopProcess(args.id)
        ? okResult(`Stopped ${args.id}`)
        : errResult(`No process ${args.id}`)
    }
  }
]
