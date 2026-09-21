import { resolve, normalize, isAbsolute, relative, sep } from 'node:path'

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

/** Resolve a user path against workspace; reject escapes unless allowOutside. */
export function resolveInWorkspace(
  workspacePath: string,
  userPath: string,
  allowOutside = false
): string {
  if (!workspacePath && !allowOutside) {
    throw new WorkspaceError(
      'No workspace configured. Set a workspace path in Settings before using file tools.'
    )
  }

  const base = workspacePath ? resolve(workspacePath) : process.cwd()
  const target = isAbsolute(userPath) ? resolve(userPath) : resolve(base, userPath)
  const normalizedTarget = normalize(target)
  const normalizedBase = normalize(base)

  if (!allowOutside) {
    const rel = relative(normalizedBase, normalizedTarget)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new WorkspaceError(
        `Path escapes workspace sandbox: ${userPath} (workspace: ${normalizedBase})`
      )
    }
  }

  return normalizedTarget
}

export function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith(`..${sep}`) && !rel.startsWith('..') && !isAbsolute(rel))
}
