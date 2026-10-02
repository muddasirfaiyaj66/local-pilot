import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { commandLeavesWorkspace, isDeniedCommand, looksInteractive, shellTools } from './shell'

describe('isDeniedCommand', () => {
  it('blocks destructive patterns', () => {
    expect(isDeniedCommand('rm -rf /')).toBe(true)
    expect(isDeniedCommand('shutdown now')).toBe(true)
  })

  it('allows normal commands', () => {
    expect(isDeniedCommand('npm test')).toBe(false)
    expect(isDeniedCommand('git status')).toBe(false)
  })
})

describe('commandLeavesWorkspace', () => {
  const root = resolve(join('tmp', 'localpilot-ws'))

  it('allows commands that stay in the workspace', () => {
    expect(commandLeavesWorkspace('npm test', root)).toBeNull()
    expect(commandLeavesWorkspace('cd src && npm test', root)).toBeNull()
  })

  it('blocks cd that leaves the workspace', () => {
    expect(commandLeavesWorkspace('cd', root)).toMatch(/home directory/)
    expect(commandLeavesWorkspace('cd ..', root)).toMatch(/leaves the workspace/)
  })

  it('blocks absolute redirects outside the workspace', () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\Temp\\out.txt' : '/etc/lp-out.txt'
    expect(commandLeavesWorkspace(`echo hi > "${outside}"`, root)).toMatch(/writes outside/)
  })
})

describe('looksInteractive', () => {
  it('detects cancelled prompts', () => {
    expect(looksInteractive('npm notice run npx\nOperation cancelled')).toBe(true)
    expect(looksInteractive('Ok to proceed? (y)')).toBe(true)
  })

  it('ignores ordinary output', () => {
    expect(looksInteractive('added 95 packages in 7s')).toBe(false)
  })
})

describe('shell_run', () => {
  const run = shellTools.find((t) => t.name === 'shell_run')!
  const ctx = { workspacePath: tmpdir(), allowOutsideWorkspace: false }

  it('reports a non-zero exit code as a failure', async () => {
    const result = await run.execute({ command: 'node -e "process.exit(2)"' }, ctx)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('exit code 2')
  })

  it('succeeds and keeps output for a working command', async () => {
    const result = await run.execute({ command: 'node -e "console.log(\'hi\')"' }, ctx)
    expect(result.ok).toBe(true)
    expect(result.output).toContain('hi')
  })
})
