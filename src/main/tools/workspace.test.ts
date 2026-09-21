import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getTool } from '../tools/registry'
import { resolveInWorkspace } from '../tools/workspace'

const dirs: string[] = []

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'lp-ws-'))
  dirs.push(d)
  return d
}

describe('resolveInWorkspace', () => {
  it('resolves relative paths under workspace', () => {
    const ws = tempDir()
    expect(resolveInWorkspace(ws, 'src/a.ts')).toBe(join(ws, 'src', 'a.ts'))
  })

  it('rejects escapes', () => {
    const ws = tempDir()
    expect(() => resolveInWorkspace(ws, '../outside')).toThrow(/escapes/)
  })

  it('requires workspace when not allowOutside', () => {
    expect(() => resolveInWorkspace('', 'x')).toThrow(/No workspace/)
  })
})

describe('fs_list', () => {
  it('reports empty directories with workspace path (not a silent blank)', async () => {
    const ws = tempDir()
    const tool = getTool('fs_list')
    expect(tool).toBeTruthy()
    const result = await tool!.execute({ path: '.' }, { workspacePath: ws, allowOutsideWorkspace: false })
    expect(result.ok).toBe(true)
    expect(result.output).toContain(`Workspace: ${ws}`)
    expect(result.output).toMatch(/0 entries/)
    expect(result.output).toMatch(/empty directory/i)
    expect(result.output).toMatch(/Do not call fs_list again/i)
  })

  it('lists files when present', async () => {
    const ws = tempDir()
    writeFileSync(join(ws, 'readme.md'), '# hi')
    mkdirSync(join(ws, 'src'))
    const tool = getTool('fs_list')!
    const result = await tool.execute({ path: '.' }, { workspacePath: ws, allowOutsideWorkspace: false })
    expect(result.ok).toBe(true)
    expect(result.output).toContain('file readme.md')
    expect(result.output).toContain('dir src')
  })

  it('treats blank path as workspace root', async () => {
    const ws = tempDir()
    writeFileSync(join(ws, 'a.txt'), 'x')
    const tool = getTool('fs_list')!
    const result = await tool.execute({ path: '  ' }, { workspacePath: ws, allowOutsideWorkspace: false })
    expect(result.ok).toBe(true)
    expect(result.output).toContain('file a.txt')
  })
})
