import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { codeTools } from './code'
import { fsTools } from './fs'
import { loadIgnoreMatcher } from './ignore'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lp-ignore-'))
  dirs.push(dir)
  return dir
}

describe('loadIgnoreMatcher', () => {
  it('skips gitignored paths, binaries, and node_modules', () => {
    const root = tempDir()
    writeFileSync(join(root, '.gitignore'), '*.log\nsecret.txt\ndist/\n!keep.log\n')
    const matcher = loadIgnoreMatcher(root)
    expect(matcher.ignores(join(root, 'notes.log'), false)).toBe(true)
    expect(matcher.ignores(join(root, 'keep.log'), false)).toBe(false)
    expect(matcher.ignores(join(root, 'secret.txt'), false)).toBe(true)
    expect(matcher.ignores(join(root, 'src', 'app.ts'), false)).toBe(false)
    expect(matcher.ignores(join(root, 'dist'), true)).toBe(true)
    expect(matcher.ignores(join(root, 'dist', 'app.js'), false)).toBe(true)
    expect(matcher.ignores(join(root, 'node_modules', 'pkg', 'index.js'), false)).toBe(true)
    expect(matcher.ignores(join(root, 'logo.png'), false)).toBe(true)
  })
})

describe('fs_search', () => {
  it('does not search ignored or dependency files', async () => {
    const root = tempDir()
    writeFileSync(join(root, '.gitignore'), 'secret.txt\n')
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'secret.txt'), 'NEEDLE hidden')
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'NEEDLE vendor')
    writeFileSync(join(root, 'src', 'app.ts'), 'NEEDLE visible')
    const search = fsTools.find((tool) => tool.name === 'fs_search')!
    const result = await search.execute(
      { query: 'NEEDLE', path: '.' },
      { workspacePath: root, allowOutsideWorkspace: false }
    )
    expect(result.ok).toBe(true)
    expect(result.output).toContain('src')
    expect(result.output).not.toContain('secret.txt')
    expect(result.output).not.toContain('node_modules')
  })
})

describe('code_repo_index', () => {
  it('omits ignored directories and lists package scripts', async () => {
    const root = tempDir()
    writeFileSync(join(root, '.gitignore'), 'dist/\n')
    mkdirSync(join(root, 'dist'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'dist', 'bundle.js'), 'x')
    writeFileSync(join(root, 'src', 'main.ts'), 'x')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    const index = codeTools.find((tool) => tool.name === 'code_repo_index')!
    const result = await index.execute({}, { workspacePath: root, allowOutsideWorkspace: false })
    expect(result.ok).toBe(true)
    expect(result.output).toContain('src/')
    expect(result.output).toContain('main.ts')
    expect(result.output).not.toContain('dist/')
    expect(result.output).toContain('dev: vite')
  })
})
