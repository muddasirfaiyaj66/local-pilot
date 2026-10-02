import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { loadIgnoreMatcher } from './ignore'
import { resolveInWorkspace } from './workspace'

export interface WorkspaceTreeNode {
  name: string
  dir: boolean
  children?: Array<{ name: string; dir: boolean }>
}

export function listWorkspaceTree(workspacePath: string): WorkspaceTreeNode[] {
  const root = resolveInWorkspace(workspacePath, '.')
  const ignore = loadIgnoreMatcher(root)
  const nodes: WorkspaceTreeNode[] = []
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, ent.name)
    const dir = ent.isDirectory()
    if (ignore.ignores(abs, dir)) continue
    const node: WorkspaceTreeNode = { name: ent.name, dir }
    if (dir) {
      const children: Array<{ name: string; dir: boolean }> = []
      try {
        for (const child of readdirSync(abs, { withFileTypes: true })) {
          const childAbs = join(abs, child.name)
          const childDir = child.isDirectory()
          if (ignore.ignores(childAbs, childDir)) continue
          children.push({ name: child.name, dir: childDir })
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
