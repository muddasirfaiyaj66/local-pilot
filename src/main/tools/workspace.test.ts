import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getTool } from '../tools/registry'
import { fileMatchesGlob } from '../tools/fs'
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

  it('edits a unique snippet and rejects repeated text', async () => {
    const ws = tempDir()
    writeFileSync(join(ws, 'a.txt'), 'one\none\n')
    const edit = getTool('fs_edit')!
    const ctx = { workspacePath: ws, allowOutsideWorkspace: false }
    const ambiguous = await edit.execute({ path: 'a.txt', oldText: 'one', newText: 'two' }, ctx)
    expect(ambiguous.ok).toBe(false)
    expect(ambiguous.error).toMatch(/2 times/)
    expect(readFileSync(join(ws, 'a.txt'), 'utf8')).toBe('one\none\n')
    const unique = await edit.execute({ path: 'a.txt', oldText: 'one\none', newText: 'two' }, ctx)
    expect(unique.ok).toBe(true)
    expect(readFileSync(join(ws, 'a.txt'), 'utf8')).toBe('two\n')
  })

  it('keeps oversized writes on disk without a review payload', async () => {
    const ws = tempDir()
    const content = 'x'.repeat(80_001)
    const write = getTool('fs_write')!
    const result = await write.execute(
      { path: 'big.txt', content },
      { workspacePath: ws, allowOutsideWorkspace: false }
    )
    expect(result.ok).toBe(true)
    expect(result.meta?.oversized).toBe(true)
    expect(result.meta?.before).toBeUndefined()
    expect(readFileSync(join(ws, 'big.txt'), 'utf8')).toBe(content)
  })

  it('searches case-insensitively and honors a glob', async () => {
    const ws = tempDir()
    mkdirSync(join(ws, 'src'))
    writeFileSync(join(ws, 'src', 'App.tsx'), 'export const Title = "Hello"\n')
    writeFileSync(join(ws, 'notes.md'), 'hello notes\n')
    const search = getTool('fs_search')!
    const ctx = { workspacePath: ws, allowOutsideWorkspace: false }
    const all = await search.execute({ query: 'HELLO', path: '.' }, ctx)
    expect(all.ok).toBe(true)
    expect(all.output).toContain('src/App.tsx:1:')
    expect(all.output).toContain('notes.md:1:')
    const tsx = await search.execute({ query: 'hello', path: '.', glob: '*.tsx' }, ctx)
    expect(tsx.output).toContain('src/App.tsx:1:')
    expect(tsx.output).not.toContain('notes.md')
  })

  it('matches simple globs', () => {
    expect(fileMatchesGlob('src/App.tsx', '*.tsx')).toBe(true)
    expect(fileMatchesGlob('src/App.tsx', 'src/*.tsx')).toBe(true)
    expect(fileMatchesGlob('src/App.tsx', '*.md')).toBe(false)
  })
})

describe('code_git_commit', () => {
  it('stages new files before committing', async () => {
    let gitReady = true
    try {
      execFileSync('git', ['--version'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      gitReady = false
    }
    if (!gitReady) return
    const ws = tempDir()
    const git = (args: string[]): string =>
      execFileSync('git', args, { cwd: ws, windowsHide: true, encoding: 'utf8' })
    git(['init'])
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'LocalPilot Test'])
    writeFileSync(join(ws, 'new.txt'), 'hello\n')
    const commit = getTool('code_git_commit')!
    const result = await commit.execute(
      { message: 'add new file' },
      { workspacePath: ws, allowOutsideWorkspace: false }
    )
    expect(result.ok, result.error).toBe(true)
    expect(git(['status', '--short']).trim()).toBe('')
    expect(git(['log', '-1', '--pretty=%s']).trim()).toBe('add new file')
  })
})

describe('fs_list blank path', () => {
  it('treats blank path as workspace root', async () => {
    const ws = tempDir()
    writeFileSync(join(ws, 'a.txt'), 'x')
    const tool = getTool('fs_list')!
    const result = await tool.execute({ path: '  ' }, { workspacePath: ws, allowOutsideWorkspace: false })
    expect(result.ok).toBe(true)
    expect(result.output).toContain('file a.txt')
  })
})
