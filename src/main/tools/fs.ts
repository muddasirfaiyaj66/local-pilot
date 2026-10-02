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
  maxResults: z.number().int().positive().max(100).optional()
})

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
      return okResult(`Wrote ${args.content.length} chars to ${full}`, {
        path: full,
        relativePath: args.path,
        before,
        after: args.content,
        kind: 'write',
        created
      })
    })
  },
  {
    name: 'fs_edit',
    description: 'Replace exact oldText with newText in a file (diff-style edit).',
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
      if (!before.includes(args.oldText)) {
        return errResult('oldText not found in file (exact match required)')
      }
      const after = before.replace(args.oldText, args.newText)
      writeFileSync(full, after, 'utf8')
      return okResult(`Edited ${full}`, {
        path: full,
        relativePath: args.path,
        before,
        after,
        kind: 'edit'
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
    description: 'Search file contents under a path for a substring (simple ripgrep-like scan).',
    risk: 'safe',
    timeoutMs: 30_000,
    parameters: SearchArgs,
    jsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string' },
        maxResults: { type: 'number' }
      },
      required: ['query']
    },
    preview: (a) => `Search "${String(a.query ?? '')}" in ${String(a.path ?? '.')}`,
    execute: wrap(async (raw, ctx) => {
      const args = SearchArgs.parse(raw)
      const root = resolveInWorkspace(ctx.workspacePath, args.path)
      const ignore = loadIgnoreMatcher(ctx.workspacePath)
      const max = args.maxResults ?? 40
      const hits: string[] = []
      walk(root, ignore, (file) => {
        if (hits.length >= max) return false
        try {
          const text = readFileSync(file, 'utf8')
          const lines = text.split(/\r?\n/)
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? ''
            if (hits.length >= max) return false
            if (line.includes(args.query)) {
              hits.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 200)}`)
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
