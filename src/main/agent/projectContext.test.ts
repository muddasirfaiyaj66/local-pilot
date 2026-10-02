import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readProjectRules } from './projectContext'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('readProjectRules', () => {
  it('reads AGENTS.md and .localpilot/rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'lp-rules-'))
    dirs.push(root)
    writeFileSync(join(root, 'AGENTS.md'), 'Prefer small diffs.')
    mkdirSync(join(root, '.localpilot'), { recursive: true })
    writeFileSync(join(root, '.localpilot', 'rules'), 'Do not add dependencies.')
    const text = readProjectRules(root)
    expect(text).toContain('Prefer small diffs.')
    expect(text).toContain('Do not add dependencies.')
  })

  it('returns empty when the workspace has no rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'lp-rules-empty-'))
    dirs.push(root)
    expect(readProjectRules(root)).toBe('')
    expect(readProjectRules('')).toBe('')
  })
})
