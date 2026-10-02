import { existsSync, mkdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveInWorkspace } from './workspace'

/**
 * Put a reviewed file back. New files (created by the agent) are removed.
 * Paths outside the workspace are rejected.
 */
export function restoreWorkspaceFile(
  workspacePath: string,
  filePath: string,
  content: string,
  created: boolean
): void {
  const full = resolveInWorkspace(workspacePath, filePath, false)
  if (created) {
    if (!existsSync(full)) return
    const st = statSync(full)
    if (st.isDirectory()) {
      rmSync(full, { recursive: false, force: false })
    } else {
      unlinkSync(full)
    }
    return
  }
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content, 'utf8')
}
