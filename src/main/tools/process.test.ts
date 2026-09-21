import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { processTools, stopAllProcesses } from './process'

const start = processTools.find((t) => t.name === 'proc_start')!
const logs = processTools.find((t) => t.name === 'proc_logs')!
const ctx = { workspacePath: tmpdir(), allowOutsideWorkspace: false }

afterAll(() => {
  stopAllProcesses()
})

describe('proc_start', () => {
  it('captures output and detects a localhost URL', async () => {
    const result = await start.execute(
      { command: 'node -e "console.log(\'ready at http://localhost:4321/\')"', waitMs: 8000 },
      ctx
    )
    expect(result.ok).toBe(true)
    expect(result.meta?.previewUrl).toBe('http://localhost:4321/')
  })

  it('reports a failing command as an error', async () => {
    const result = await start.execute({ command: 'node -e "process.exit(3)"', waitMs: 8000 }, ctx)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('code 3')
  })

  it('blocks destructive commands', async () => {
    const result = await start.execute({ command: 'rm -rf /' }, ctx)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('deny list')
  })
})

describe('proc_logs', () => {
  it('errors when no process matches', async () => {
    const result = await logs.execute({ id: 'nope' }, ctx)
    expect(result.ok).toBe(false)
  })
})
