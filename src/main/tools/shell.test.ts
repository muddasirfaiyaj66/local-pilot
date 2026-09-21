import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { isDeniedCommand, looksInteractive, shellTools } from './shell'

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
