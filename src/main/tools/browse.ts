import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { loadIgnoreMatcher } from './ignore'
import { resolveInWorkspace } from './workspace'

export interface WorkspaceTreeNode {
  name: string
  path: string
  dir: boolean
  children?: WorkspaceTreeNode[]
}

export function listWorkspaceTree(workspacePath: string): WorkspaceTreeNode[] {
  const root = resolveInWorkspace(workspacePath, '.')
  const ignore = loadIgnoreMatcher(root)
  const nodes: WorkspaceTreeNode[] = []
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, ent.name)
    const dir = ent.isDirectory()
    if (ignore.ignores(abs, dir)) continue
    const node: WorkspaceTreeNode = { name: ent.name, path: ent.name, dir }
    if (dir) {
      const children: WorkspaceTreeNode[] = []
      try {
        for (const child of readdirSync(abs, { withFileTypes: true })) {
          const childAbs = join(abs, child.name)
          const childDir = child.isDirectory()
          if (ignore.ignores(childAbs, childDir)) continue
          children.push({
            name: child.name,
            path: `${ent.name}/${child.name}`,
            dir: childDir
          })
          if (children.length >= 40) break
        }
      } catch {
        // unreadable directory
      }
      node.children = children
    }
    nodes.push(node)
    if (nodes.length >= 80) break
  }
  return nodes
}

/** One directory level, for lazy tree expansion in the repo explorer. */
export function listWorkspaceChildren(workspacePath: string, userPath: string): WorkspaceTreeNode[] {
  const root = resolveInWorkspace(workspacePath, '.')
  const dir = resolveInWorkspace(workspacePath, userPath || '.')
  const ignore = loadIgnoreMatcher(root)
  const nodes: WorkspaceTreeNode[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name)
    const isDir = ent.isDirectory()
    if (ignore.ignores(abs, isDir)) continue
    const rel = relative(root, abs).split('\\').join('/')
    nodes.push({ name: ent.name, path: rel, dir: isDir })
  }
  // Folders first, then files, each alphabetical — like a file explorer.
  return nodes.sort((a, b) =>
    a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1
  )
}

/** Save an editor buffer inside the workspace. */
export function writeWorkspaceText(workspacePath: string, userPath: string, content: string): void {
  const full = resolveInWorkspace(workspacePath, userPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content, 'utf8')
}

export function searchWorkspaceFiles(workspacePath: string, query: string): string[] {
  const root = resolveInWorkspace(workspacePath, '.')
  const ignore = loadIgnoreMatcher(root)
  const needle = query.trim().toLowerCase()
  const hits: string[] = []
  walk(root, ignore, (file) => {
    const rel = relative(root, file).split('\\').join('/')
    const name = rel.split('/').pop() ?? rel
    if (!needle || name.toLowerCase().includes(needle) || rel.toLowerCase().includes(needle)) {
      hits.push(rel)
    }
    return hits.length < 30
  })
  return hits
}

export interface TextSearchHit {
  path: string
  line: number
  column: number
  preview: string
}

export interface TextSearchOptions {
  caseSensitive?: boolean
  regex?: boolean
  wholeWord?: boolean
  maxResults?: number
}

/** Find text in workspace files (skips ignored, binary, and >1MB files). */
export function searchWorkspaceText(
  workspacePath: string,
  query: string,
  options: TextSearchOptions = {}
): TextSearchHit[] {
  if (!query) return []
  const root = resolveInWorkspace(workspacePath, '.')
  const ignore = loadIgnoreMatcher(root)
  const max = Math.min(Math.max(options.maxResults ?? 500, 1), 2000)
  const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = options.wholeWord ? `\\b(?:${source})\\b` : source
  const re = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi')
  const hits: TextSearchHit[] = []
  walk(root, ignore, (file) => {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return true
    }
    if (text.includes('\u0000')) return true
    const rel = relative(root, file).split('\\').join('/')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]!
      re.lastIndex = 0
      const match = re.exec(lineText)
      if (!match) continue
      hits.push({
        path: rel,
        line: i + 1,
        column: match.index + 1,
        preview: lineText.trim().slice(0, 240)
      })
      if (hits.length >= max) return false
    }
    return true
  })
  return hits
}

/** Create an empty file or a folder inside the workspace. */
export function createWorkspaceEntry(workspacePath: string, userPath: string, dir: boolean): void {
  const full = resolveInWorkspace(workspacePath, userPath)
  if (existsSync(full)) throw new Error(`Already exists: ${userPath}`)
  if (dir) {
    mkdirSync(full, { recursive: true })
  } else {
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, '', 'utf8')
  }
}

export function renameWorkspaceEntry(workspacePath: string, from: string, to: string): void {
  const src = resolveInWorkspace(workspacePath, from)
  const dest = resolveInWorkspace(workspacePath, to)
  if (!existsSync(src)) throw new Error(`Not found: ${from}`)
  if (existsSync(dest)) throw new Error(`Already exists: ${to}`)
  mkdirSync(dirname(dest), { recursive: true })
  renameSync(src, dest)
}

/** Move a workspace path to the OS trash, falling back to a hard delete. */
export async function deleteWorkspaceEntry(workspacePath: string, userPath: string): Promise<void> {
  const root = resolveInWorkspace(workspacePath, '.')
  const full = resolveInWorkspace(workspacePath, userPath)
  if (full === root) throw new Error('Refusing to delete the workspace root')
  try {
    const trashMod = await import('trash')
    const trashFn =
      typeof trashMod.default === 'function'
        ? trashMod.default
        : (trashMod as unknown as (paths: string[]) => Promise<void>)
    await trashFn([full])
  } catch {
    rmSync(full, { recursive: true, force: true })
  }
}

/**
 * Read a file for an editor. Unlike readWorkspaceText, truncation is reported
 * instead of marked with a trailing "…", so a caller never saves a cut-off
 * buffer back over the real file.
 */
export function readWorkspaceFileForEdit(
  workspacePath: string,
  userPath: string,
  maxChars: number
): { text: string; truncated: boolean; binary: boolean } {
  const full = resolveInWorkspace(workspacePath, userPath)
  const buffer = readFileSync(full)
  const binary = buffer.subarray(0, 8000).includes(0)
  if (binary) return { text: '', truncated: false, binary: true }
  const text = buffer.toString('utf8')
  return text.length > maxChars
    ? { text: text.slice(0, maxChars), truncated: true, binary: false }
    : { text, truncated: false, binary: false }
}

export function readWorkspaceText(workspacePath: string, userPath: string, maxChars = 8_000): string {
  const full = resolveInWorkspace(workspacePath, userPath)
  const text = readFileSync(full, 'utf8')
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text
}

function walk(
  dir: string,
  ignore: ReturnType<typeof loadIgnoreMatcher>,
  visit: (file: string) => boolean
): boolean {
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
