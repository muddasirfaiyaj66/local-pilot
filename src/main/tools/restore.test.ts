import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreWorkspaceFile } from './restore'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('restoreWorkspaceFile', () => {
  it('deletes a file the agent created and restores an edited file', () => {
    const root = mkdtempSync(join(tmpdir(), 'lp-restore-'))
    dirs.push(root)
    const created = join(root, 'new.txt')
    const edited = join(root, 'old.txt')
    writeFileSync(created, 'fresh')
    writeFileSync(edited, 'after')

    restoreWorkspaceFile(root, 'new.txt', '', true)
    restoreWorkspaceFile(root, 'old.txt', 'before', false)

    expect(existsSync(created)).toBe(false)
    expect(readFileSync(edited, 'utf8')).toBe('before')
  })

  it('rejects paths outside the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'lp-restore-out-'))
    dirs.push(root)
    expect(() => restoreWorkspaceFile(root, '../outside.txt', 'x', false)).toThrow(/escapes|workspace/)
  })
})
