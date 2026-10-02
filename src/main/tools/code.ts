import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { loadIgnoreMatcher, type IgnoreMatcher } from './ignore'
import { errResult, okResult, type RegisteredTool } from './types'
import { resolveInWorkspace, WorkspaceError } from './workspace'

const execFileAsync = promisify(execFile)

const PatchArgs = z.object({
  path: z.string(),
  oldText: z.string(),
  newText: z.string()
})

const TestArgs = z.object({
  command: z.string().default('npm test'),
  timeoutMs: z.number().int().positive().max(600_000).optional()
})

const GitArgs = z.object({
  message: z.string().optional()
})

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 2_000_000,
    windowsHide: true
  })
  return (stdout || stderr || '').trim()
}

export const codeTools: RegisteredTool[] = [
  {
    name: 'code_git_status',
    description: 'Show git status in the workspace.',
    risk: 'safe',
    timeoutMs: 15_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'git status',
    execute: async (_args, ctx) => {
      try {
        const cwd = resolveInWorkspace(ctx.workspacePath, '.')
        const out = await git(cwd, ['status', '--short', '--branch'])
        return okResult(out || '(clean)')
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'code_git_diff',
    description: 'Show git diff (unstaged + staged summary) in the workspace.',
    risk: 'safe',
    timeoutMs: 20_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'git diff',
    execute: async (_args, ctx) => {
      try {
        const cwd = resolveInWorkspace(ctx.workspacePath, '.')
        const unstaged = await git(cwd, ['diff'])
        const staged = await git(cwd, ['diff', '--cached'])
        return okResult(
          [`--- unstaged ---\n${unstaged || '(none)'}`, `--- staged ---\n${staged || '(none)'}`].join(
            '\n\n'
          )
        )
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'code_git_commit',
    description: 'Create a git commit in the workspace with the given message (stages tracked changes with -a).',
    risk: 'risky',
    timeoutMs: 30_000,
    parameters: GitArgs,
    jsonSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    },
    preview: (a) => `git commit -am "${String(a.message ?? '')}"`,
    execute: async (raw, ctx) => {
      try {
        const args = GitArgs.parse(raw)
        if (!args.message?.trim()) return errResult('Commit message required')
        const cwd = resolveInWorkspace(ctx.workspacePath, '.')
        const out = await git(cwd, ['commit', '-am', args.message.trim()])
        return okResult(out || 'Committed')
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'code_apply_patch',
    description: 'Apply a simple exact-text patch to a file (same as fs_edit, for coding workflows).',
    risk: 'risky',
    timeoutMs: 15_000,
    parameters: PatchArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' }
      },
      required: ['path', 'oldText', 'newText']
    },
    preview: (a) => `Patch ${String(a.path ?? '')}`,
    execute: async (raw, ctx) => {
      const { fsTools } = await import('./fs')
      const edit = fsTools.find((t) => t.name === 'fs_edit')
      if (!edit) return errResult('fs_edit unavailable')
      return edit.execute(raw, ctx)
    }
  },
  {
    name: 'code_run_tests',
    description: 'Run the project test command inside the workspace (default: npm test).',
    risk: 'risky',
    timeoutMs: 300_000,
    parameters: TestArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeoutMs: { type: 'number' }
      }
    },
    preview: (a) => `Run tests: ${String(a.command ?? 'npm test')}`,
    execute: async (raw, ctx) => {
      try {
        const args = TestArgs.parse(raw)
        resolveInWorkspace(ctx.workspacePath, '.')
        const { shellTools } = await import('./shell')
        const run = shellTools.find((t) => t.name === 'shell_run')
        if (!run) return errResult('shell_run unavailable')
        return run.execute(
          { command: args.command, cwd: '.', timeoutMs: args.timeoutMs ?? 180_000 },
          ctx
        )
      } catch (err) {
        if (err instanceof WorkspaceError) return errResult(err.message)
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  },
  {
    name: 'code_repo_index',
    description:
      'List a shallow project tree (gitignore-aware) plus manifest scripts (package.json and similar).',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    preview: () => 'Index repository',
    execute: async (_args, ctx) => {
      try {
        const root = resolveInWorkspace(ctx.workspacePath, '.')
        const ignore = loadIgnoreMatcher(root)
        const tree = shallowTree(root, ignore)
        const manifests = readManifests(root)
        return okResult(`# tree\n${tree || '(empty)'}\n\n${manifests}`)
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err))
      }
    }
  }
]

const TREE_LIMIT = 160

function shallowTree(root: string, ignore: IgnoreMatcher): string {
  const lines: string[] = []
  const entries = readdirSync(root, { withFileTypes: true })
  for (const ent of entries) {
    if (lines.length >= TREE_LIMIT) break
    const abs = join(root, ent.name)
    const isDir = ent.isDirectory()
    if (ignore.ignores(abs, isDir)) continue
    lines.push(isDir ? `${ent.name}/` : ent.name)
    if (!isDir) continue
    let children
    try {
      children = readdirSync(abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const child of children) {
      if (lines.length >= TREE_LIMIT) break
      const childAbs = join(abs, child.name)
      const childDir = child.isDirectory()
      if (ignore.ignores(childAbs, childDir)) continue
      lines.push(`  ${child.name}${childDir ? '/' : ''}`)
    }
  }
  return lines.join('\n')
}

function readManifests(root: string): string {
  const sections: string[] = []
  const pkg = join(root, 'package.json')
  if (existsSync(pkg)) {
    try {
      const json = JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }
      const scripts = Object.entries(json.scripts ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      sections.push(`# package.json scripts\n${scripts || '(none)'}`)
    } catch {
      sections.push('# package.json scripts\n(unreadable)')
    }
  }
  for (const name of ['pyproject.toml', 'Cargo.toml', 'go.mod', 'requirements.txt']) {
    if (existsSync(join(root, name))) sections.push(`# manifest\n${name}`)
  }
  return sections.join('\n\n') || '# manifests\n(none)'
}
