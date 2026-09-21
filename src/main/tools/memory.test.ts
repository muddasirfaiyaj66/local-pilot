import { afterEach, describe, expect, it } from 'vitest'
import { memoryTools } from './memoryTools'

describe('memory tools', () => {
  afterEach(() => {
    // notes persist in cwd/.localpilot-memory during tests — ok for unit checks
  })

  it('registers memory tools', () => {
    expect(memoryTools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['memory_add', 'memory_search', 'memory_list'])
    )
  })

  it('add + search notes when node:sqlite is available', async () => {
    let sqliteOk = true
    try {
      await import('node:sqlite')
    } catch {
      sqliteOk = false
    }
    if (!sqliteOk) return

    const add = memoryTools.find((t) => t.name === 'memory_add')!
    const search = memoryTools.find((t) => t.name === 'memory_search')!
    const marker = `lp-test-${Date.now()}`
    const added = await add.execute(
      { kind: 'test', content: marker },
      { workspacePath: '', allowOutsideWorkspace: false }
    )
    expect(added.ok).toBe(true)

    const found = await search.execute(
      { query: marker },
      { workspacePath: '', allowOutsideWorkspace: false }
    )
    expect(found.ok).toBe(true)
    expect(found.output).toContain(marker)
  })
})
