import type { RiskLevel } from '@shared/agent'
import type { PermissionMode } from '@shared/types'
import type { RegisteredTool } from '../tools/types'

export function classifyToolRisk(tool: RegisteredTool, args: Record<string, unknown>): RiskLevel {
  if (tool.name === 'shell_run') {
    const cwd = args.cwd
    if (typeof cwd === 'string' && (cwd.includes('..') || /^[a-zA-Z]:[\\/]/.test(cwd) || cwd.startsWith('/'))) {
      // may be outside — treat as critical if absolute-looking
      if (/^[a-zA-Z]:[\\/]/.test(cwd) || cwd.startsWith('/')) return 'critical'
    }
    return 'risky'
  }
  if (tool.name === 'fs_delete') return 'critical'
  return tool.risk
}

/**
 * Returns true if the action may proceed without prompting the user.
 */
export function shouldAutoAllow(mode: PermissionMode, risk: RiskLevel): boolean {
  if (mode === 'autonomous') return true
  if (mode === 'ask-every-time') return false
  // ask-risky (default): auto-allow safe only
  return risk === 'safe'
}

export function riskLabel(risk: RiskLevel): string {
  switch (risk) {
    case 'safe':
      return 'Safe'
    case 'risky':
      return 'Risky'
    case 'critical':
      return 'Critical'
  }
}
