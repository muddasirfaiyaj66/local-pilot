import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createWorkspaceEntry,
  readWorkspaceFileForEdit,
  renameWorkspaceEntry,
  searchWorkspaceText
} from './browse'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lp-browse-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'a.ts'), 'const Foo = 1\nconst food = 2\nfoo.bar()\n')
  writeFileSync(join(dir, 'src', 'b.md'), 'no match here\n')
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0x66, 0x6f, 0x6f, 0x00, 0x01]))
  return dir
}

describe('searchWorkspaceText', () => {
  it('finds case-insensitive matches with line and column, skipping binary files', () => {
    const hits = searchWorkspaceText(workspace(), 'foo')
    expect(hits.map((h) => `${h.path}:${h.line}:${h.column}`)).toEqual(['src/a.ts:1:7', 'src/a.ts:2:7', 'src/a.ts:3:1'])
  })

  it('honours case sensitivity and whole-word', () => {
    const ws = workspace()
    expect(searchWorkspaceText(ws, 'Foo', { caseSensitive: true })).toHaveLength(1)
    expect(searchWorkspaceText(ws, 'foo', { wholeWord: true }).map((h) => h.line)).toEqual([1, 3])
  })

  it('treats the query literally unless regex is on', () => {
    const ws = workspace()
    expect(searchWorkspaceText(ws, 'foo.bar')).toHaveLength(1)
    expect(searchWorkspaceText(ws, 'f.o', {})).toHaveLength(0)
    expect(searchWorkspaceText(ws, 'f.o', { regex: true })).toHaveLength(3)
  })
})

describe('workspace file operations', () => {
  it('creates files and folders, refusing to overwrite', () => {
    const ws = workspace()
    createWorkspaceEntry(ws, 'new/dir', true)
    createWorkspaceEntry(ws, 'new/dir/file.ts', false)
    expect(existsSync(join(ws, 'new', 'dir', 'file.ts'))).toBe(true)
    expect(() => createWorkspaceEntry(ws, 'src/a.ts', false)).toThrow(/Already exists/)
  })

  it('renames inside the workspace and blocks escapes', () => {
    const ws = workspace()
    renameWorkspaceEntry(ws, 'src/b.md', 'docs/b.md')
    expect(readFileSync(join(ws, 'docs', 'b.md'), 'utf8')).toBe('no match here\n')
    expect(() => renameWorkspaceEntry(ws, 'src/a.ts', '../escape.ts')).toThrow()
  })

  it('reports truncation and binary content instead of marking text', () => {
    const ws = workspace()
    expect(readWorkspaceFileForEdit(ws, 'src/a.ts', 5)).toEqual({ text: 'const', truncated: true, binary: false })
    expect(readWorkspaceFileForEdit(ws, 'bin.dat', 100)).toEqual({ text: '', truncated: false, binary: true })
    expect(readWorkspaceFileForEdit(ws, 'src/b.md', 100).truncated).toBe(false)
  })
})
