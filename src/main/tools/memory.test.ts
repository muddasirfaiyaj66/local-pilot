import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { memoryTools } from './memoryTools'

function sqliteAvailable(): boolean {
  try {
    if (typeof process.getBuiltinModule === 'function') {
      const mod = process.getBuiltinModule('node:sqlite') as { DatabaseSync?: unknown } | undefined
      if (mod?.DatabaseSync) return true
    }
    const require = createRequire(import.meta.url)
    const mod = require('node:sqlite') as { DatabaseSync?: unknown }
    return typeof mod.DatabaseSync === 'function'
  } catch {
    return false
  }
}

describe('memory tools', () => {
  it('registers memory tools', () => {
    expect(memoryTools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['memory_add', 'memory_search', 'memory_list'])
    )
  })

  it('add + search notes when node:sqlite is available', async () => {
    if (!sqliteAvailable()) return

    const add = memoryTools.find((t) => t.name === 'memory_add')!
    const search = memoryTools.find((t) => t.name === 'memory_search')!
    const marker = `lp-test-${Date.now()}-${process.pid}`
    const added = await add.execute(
      { kind: 'test', content: marker },
      { workspacePath: '', allowOutsideWorkspace: false }
    )
    expect(added.ok, added.output).toBe(true)

    const found = await search.execute(
      { query: marker },
      { workspacePath: '', allowOutsideWorkspace: false }
    )
    expect(found.ok, found.output).toBe(true)
    expect(found.output).toContain(marker)
  })
})
