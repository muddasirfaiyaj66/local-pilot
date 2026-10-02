import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listRecentNotes } from './memory'

const RULE_FILES = ['AGENTS.md', join('.localpilot', 'rules'), join('.localpilot', 'rules.md')]
const MAX_RULE_CHARS = 12_000
const MAX_NOTE_CHARS = 300

/** Standing project instructions from AGENTS.md or .localpilot/rules. */
export function readProjectRules(workspacePath: string): string {
  const root = workspacePath.trim()
  if (!root) return ''
  const chunks: string[] = []
  for (const rel of RULE_FILES) {
    const full = join(root, rel)
    if (!existsSync(full)) continue
    try {
      const text = readFileSync(full, 'utf8').trim()
      if (!text) continue
      chunks.push(`# ${rel.replace(/\\/g, '/')}\n${text.slice(0, 6_000)}`)
    } catch {
      // unreadable rule file is skipped
    }
  }
  return chunks.join('\n\n').slice(0, MAX_RULE_CHARS)
}

/** Recent SQLite notes, formatted for the system prompt. Empty if memory is unavailable. */
export function recentMemoryBlock(limit = 8): string {
  try {
    const notes = listRecentNotes(limit)
    if (notes.length === 0) return ''
    return notes
      .map((note) => `- (${note.kind}) ${note.content.replace(/\s+/g, ' ').slice(0, MAX_NOTE_CHARS)}`)
      .join('\n')
  } catch {
    return ''
  }
}
