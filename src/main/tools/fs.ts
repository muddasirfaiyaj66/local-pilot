import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  renameSync,
  existsSync,
  rmSync
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { z } from 'zod'
import { loadIgnoreMatcher, type IgnoreMatcher } from './ignore'
import { errResult, okResult, type RegisteredTool, type ToolContext } from './types'
import { resolveInWorkspace, WorkspaceError } from './workspace'

const ReadArgs = z.object({
  path: z.string(),
  maxBytes: z.number().int().positive().max(2_000_000).optional()
})

const WriteArgs = z.object({
  path: z.string(),
  content: z.string()
})

const EditArgs = z.object({
  path: z.string(),
  oldText: z.string(),
  newText: z.string()
})

const ListArgs = z.object({
  path: z
    .string()
    .default('.')
    .transform((s) => s.trim() || '.'),
  maxEntries: z.number().int().positive().max(500).optional()
})

const SearchArgs = z.object({
  query: z.string().min(1),
  path: z.string().default('.'),
  glob: z.string().optional(),
  maxResults: z.number().int().positive().max(100).optional()
})

/** Review stores full text only up to this size. Larger writes stay on disk. */
const REVIEW_CAP = 80_000

const MoveArgs = z.object({
  from: z.string(),
  to: z.string()
})

const DeleteArgs = z.object({
  path: z.string()
})

function wrap(
  fn: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ReturnType<typeof okResult>>
): RegisteredTool['execute'] {
  return async (args, ctx) => {
    try {
      return await fn(args, ctx)
    } catch (err) {
      if (err instanceof WorkspaceError) return errResult(err.message)
      return errResult(err instanceof Error ? err.message : String(err))
    }
  }
}

export const fsTools: RegisteredTool[] = [
  {
    name: 'fs_read',
    description: 'Read a UTF-8 text file inside the workspace.',
    risk: 'safe',
    timeoutMs: 15_000,
    parameters: ReadArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path under workspace' },
        maxBytes: { type: 'number', description: 'Max bytes to read (default 200000)' }
      },
      required: ['path']
    },
    preview: (a) => `Read file: ${String(a.path ?? '')}`,
    execute: wrap(async (raw, ctx) => {
      const args = ReadArgs.parse(raw)
      const full = resolveInWorkspace(ctx.workspacePath, args.path)
      const max = args.maxBytes ?? 200_000
      const buf = readFileSync(full)
      const truncated = buf.length > max
      const text = buf.subarray(0, max).toString('utf8')
      return okResult(text + (truncated ? `\n\n… truncated (${buf.length} bytes total)` : ''), {
        path: full,
        bytes: buf.length
      })
    })
  },
  {
    name: 'fs_write',
    description: 'Write a UTF-8 text file inside the workspace (creates parent dirs).',
    risk: 'risky',
    timeoutMs: 15_000,
    parameters: WriteArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    },
    preview: (a) => {
      const content = String(a.content ?? '')
      return `Write file: ${String(a.path ?? '')}\n---\n${content.slice(0, 800)}${content.length > 800 ? '…' : ''}`
    },
    execute: wrap(async (raw, ctx) => {
      const args = WriteArgs.parse(raw)
      const full = resolveInWorkspace(ctx.workspacePath, args.path)
      const created = !existsSync(full)
      const before = created ? '' : readFileSync(full, 'utf8')
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, args.content, 'utf8')
      const review = reviewMeta(before, args.content)
      return okResult(`Wrote ${args.content.length} chars to ${full}${review.note}`, {
        path: full,
        relativePath: args.path,
        kind: 'write',
        created,
        ...review.meta
      })
    })
  },
  {
    name: 'fs_edit',
    description:
      'Replace exact oldText with newText once. Fails if oldText is missing or appears more than once.',
    risk: 'risky',
    timeoutMs: 15_000,
    parameters: EditArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' }
      },
      required: ['path', 'oldText', 'newText']
    },
    preview: (a) =>
      `Edit ${String(a.path ?? '')}\n- ${String(a.oldText ?? '').slice(0, 200)}\n+ ${String(a.newText ?? '').slice(0, 200)}`,
    execute: wrap(async (raw, ctx) => {
      const args = EditArgs.parse(raw)
      const full = resolveInWorkspace(ctx.workspacePath, args.path)
      const before = readFileSync(full, 'utf8')
      if (!args.oldText) return errResult('oldText must not be empty')
      const matches = countOccurrences(before, args.oldText)
      if (matches === 0) return errResult('oldText not found in file (exact match required)')
      if (matches > 1) {
        return errResult(
          `oldText matched ${matches} times. Provide a longer snippet that matches once.`
        )
      }
      const after = before.replace(args.oldText, args.newText)
      writeFileSync(full, after, 'utf8')
      const review = reviewMeta(before, after)
      return okResult(`Edited ${full}${review.note}`, {
        path: full,
        relativePath: args.path,
        kind: 'edit',
        ...review.meta
      })
    })
  },
  {
    name: 'fs_list',
    description: 'List files and directories in a workspace path.',
    risk: 'safe',
    timeoutMs: 10_000,
    parameters: ListArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxEntries: { type: 'number' }
      }
    },
    preview: (a) => `List: ${String(a.path ?? '.')}`,
    execute: wrap(async (raw, ctx) => {
      const args = ListArgs.parse(raw)
      const full = resolveInWorkspace(ctx.workspacePath, args.path)
      const max = args.maxEntries ?? 200
      const entries = readdirSync(full)
        .slice(0, max)
        .map((name) => {
          const p = join(full, name)
          try {
            const st = statSync(p)
            return `${st.isDirectory() ? 'dir' : 'file'} ${name}`
          } catch {
            return `file ${name}`
          }
        })
      const rel = relative(resolveInWorkspace(ctx.workspacePath, '.'), full) || '.'
      const header = [
        `Workspace: ${ctx.workspacePath}`,
        `Path: ${rel}`,
        `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
      ].join('\n')
      if (entries.length === 0) {
        return okResult(
          `${header}\n(empty directory)\n` +
            'Note: Empty is normal for create/build goals. Do not call fs_list again — ' +
            'in Plan mode write the plan and stop; in Agent mode create files with fs_write.'
        )
      }
      return okResult(`${header}\n${entries.join('\n')}`)
    })
  },
  {
    name: 'fs_search',
    description:
      'Search file contents for a case-insensitive substring. Optional glob limits files (for example *.ts). Returns path:line and the matching line.',
    risk: 'safe',
    timeoutMs: 30_000,
    parameters: SearchArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string', description: 'Optional glob such as *.ts or src/**/*.tsx' },
        maxResults: { type: 'number' }
      },
      required: ['query']
    },
    preview: (a) => `Search "${String(a.query ?? '')}" in ${String(a.path ?? '.')}`,
    execute: wrap(async (raw, ctx) => {
      const args = SearchArgs.parse(raw)
      const workspace = resolveInWorkspace(ctx.workspacePath, '.')
      const root = resolveInWorkspace(ctx.workspacePath, args.path)
      const ignore = loadIgnoreMatcher(ctx.workspacePath)
      const needle = args.query.toLowerCase()
      const max = args.maxResults ?? 40
      const hits: string[] = []
      walk(root, ignore, (file) => {
        if (hits.length >= max) return false
        const rel = relative(workspace, file).split('\\').join('/')
        if (args.glob && !fileMatchesGlob(rel, args.glob)) return true
        try {
          const text = readFileSync(file, 'utf8')
          const lines = text.split(/\r?\n/)
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? ''
            if (hits.length >= max) return false
            if (line.toLowerCase().includes(needle)) {
              hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 180)}`)
            }
          }
        } catch {
          // skip binary / unreadable
        }
        return hits.length < max
      })
      return okResult(hits.length ? hits.join('\n') : 'No matches')
    })
  },
  {
    name: 'fs_move',
    description: 'Move or rename a file/directory inside the workspace.',
    risk: 'risky',
    timeoutMs: 15_000,
    parameters: MoveArgs,
    jsonSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to']
    },
    preview: (a) => `Move ${String(a.from ?? '')} → ${String(a.to ?? '')}`,
    execute: wrap(async (raw, ctx) => {
      const args = MoveArgs.parse(raw)
      const from = resolveInWorkspace(ctx.workspacePath, args.from)
      const to = resolveInWorkspace(ctx.workspacePath, args.to)
      mkdirSync(dirname(to), { recursive: true })
      renameSync(from, to)
      return okResult(`Moved to ${to}`)
    })
  },
  {
    name: 'fs_delete',
    description: 'Delete a file or empty directory inside the workspace (moves to OS trash when possible).',
    risk: 'critical',
    timeoutMs: 15_000,
    parameters: DeleteArgs,
    jsonSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    },
    preview: (a) => `DELETE: ${String(a.path ?? '')}`,
    execute: wrap(async (raw, ctx) => {
      const args = DeleteArgs.parse(raw)
      const full = resolveInWorkspace(ctx.workspacePath, args.path)
      if (!existsSync(full)) return errResult('Path does not exist')
      try {
        const trashMod = await import('trash')
        const trashFn =
          typeof trashMod.default === 'function'
            ? trashMod.default
            : (trashMod as unknown as (paths: string[]) => Promise<void>)
        await trashFn([full])
        return okResult(`Moved to trash: ${full}`)
      } catch {
        try {
          const st = statSync(full)
          if (st.isDirectory()) {
            rmSync(full, { recursive: false, force: false })
          } else {
            rmSync(full)
          }
          return okResult(`Deleted: ${full}`)
        } catch (err) {
          return errResult(
            err instanceof Error ? err.message : 'Could not delete path (trash failed and the path is not an empty file or directory)'
          )
        }
      }
    })
  }
]

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    count += 1
    from = at + needle.length
  }
  return count
}

function reviewMeta(before: string, after: string): {
  note: string
  meta: Record<string, unknown>
} {
  if (before.length <= REVIEW_CAP && after.length <= REVIEW_CAP) {
    return { note: '', meta: { before, after } }
  }
  return {
    note: ' Change is too large to review in the app; the file on disk is complete.',
    meta: {
      oversized: true,
      beforePreview: before.slice(0, 400),
      afterPreview: after.slice(0, 400)
    }
  }
}

/** Case-insensitive glob. A pattern with no slash also matches the file name. */
export function fileMatchesGlob(relPath: string, glob: string): boolean {
  const globNorm = glob.trim().replace(/\\/g, '/')
  if (!globNorm || globNorm === '*' || globNorm === '**' || globNorm === '**/*') return true
  const rel = relPath.replace(/\\/g, '/')
  const re = globToRegExp(globNorm)
  if (re.test(rel)) return true
  if (!globNorm.includes('/')) return re.test(rel.split('/').pop() ?? rel)
  return false
}

function globToRegExp(glob: string): RegExp {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!
    if (c === '*' && glob[i + 1] === '*') {
      pattern += '.*'
      i += 1
      if (glob[i + 1] === '/') i += 1
      continue
    }
    if (c === '*') {
      pattern += '[^/]*'
      continue
    }
    if (c === '?') {
      pattern += '[^/]'
      continue
    }
    pattern += '.+^${}()|[]\\'.includes(c) ? `\\${c}` : c
  }
  return new RegExp(`^${pattern}$`, 'i')
}

function walk(dir: string, ignore: IgnoreMatcher, visit: (file: string) => boolean): boolean {
  if (ignore.ignores(dir, true)) return true
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return true
  }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (ignore.ignores(p, true)) continue
      if (!walk(p, ignore, visit)) return false
    } else if (st.isFile() && st.size < 1_000_000) {
      if (ignore.ignores(p, false)) continue
      if (!visit(p)) return false
    }
  }
  return true
}
