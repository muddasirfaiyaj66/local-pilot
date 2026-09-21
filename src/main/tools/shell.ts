import { spawn } from 'node:child_process'
import { z } from 'zod'
import { errResult, okResult, type RegisteredTool } from './types'
import { resolveInWorkspace, WorkspaceError } from './workspace'

const RunArgs = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(300_000).optional()
})

const DENY_PATTERNS: RegExp[] = [
  /\brm\s+-?[^\n]*\s\/(\s|$)/i,
  /\brm\s+-rf\b/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdel\s+\/s\s+\/q\s+[a-z]:\\/i,
  /\b(shutdown|reboot)\b/i,
  /\bcurl\b.*\|\s*(sh|bash|powershell)/i,
  /\bwget\b.*\|\s*(sh|bash)/i
]

export function isDeniedCommand(command: string): boolean {
  return DENY_PATTERNS.some((re) => re.test(command))
}

/**
 * Spawn a shell command. On Windows, verbatim arguments are required or Node
 * re-quotes the string and breaks commands containing quotes.
 */
export function spawnShell(
  command: string,
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): ReturnType<typeof spawn> {
  const isWin = process.platform === 'win32'
  return spawn(
    isWin ? 'cmd.exe' : 'bash',
    isWin ? ['/d', '/s', '/c', command] : ['-lc', command],
    {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      ...(isWin ? { windowsVerbatimArguments: true } : {})
    }
  )
}

export const shellTools: RegisteredTool[] = [
  {
    name: 'shell_run',
    description:
      'Run a shell command with timeout. Prefer workspace cwd. Output is truncated. Denied destructive patterns are blocked.',
    risk: 'risky',
    timeoutMs: 120_000,
    parameters: RunArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string', description: 'Working directory (defaults to workspace)' },
        timeoutMs: { type: 'number' }
      },
      required: ['command']
    },
    preview: (a) => `Shell: ${String(a.command ?? '')}\ncwd: ${String(a.cwd ?? '(workspace)')}`,
    execute: async (raw, ctx) => {
      try {
        const args = RunArgs.parse(raw)
        if (isDeniedCommand(args.command)) {
          return errResult('Command blocked by deny list (destructive pattern)')
        }

        let cwd: string
        try {
          cwd = args.cwd
            ? resolveInWorkspace(ctx.workspacePath, args.cwd, ctx.allowOutsideWorkspace)
            : resolveInWorkspace(ctx.workspacePath, '.', false)
        } catch (err) {
          if (err instanceof WorkspaceError && args.cwd) {
            // Outside workspace is risky — still allow if context says so after permission
            if (ctx.allowOutsideWorkspace) {
              cwd = args.cwd
            } else {
              return errResult(err.message)
            }
          } else if (err instanceof WorkspaceError) {
            return errResult(err.message)
          } else {
            throw err
          }
        }

        const timeout = args.timeoutMs ?? 60_000
        const output = await runCommand(args.command, cwd, timeout, ctx.signal)
        return okResult(output.text, { exitCode: output.code, cwd })
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  }
]

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ text: string; code: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawnShell(command, { cwd })

    let stdout = ''
    let stderr = ''
    const max = 200_000

    const onAbort = (): void => {
      child.kill()
      reject(new Error('Command aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Command timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < max) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < max) stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      const text = [stdout, stderr].filter(Boolean).join('\n').slice(0, max) || '(no output)'
      resolvePromise({ text: `exit ${code ?? '?'}\n${text}`, code })
    })
  })
}
