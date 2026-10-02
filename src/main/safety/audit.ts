import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface AuditEntry {
  timestamp: number
  requestId: string
  toolName: string
  risk: string
  preview: string
  ok: boolean
  detail?: string
}

function auditPath(): string {
  try {
    const dir = join(app.getPath('userData'), 'audit')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'actions.jsonl')
  } catch {
    return join(process.cwd(), '.localpilot-audit.jsonl')
  }
}

/** Append one line; never log secrets (caller must redact). */
export function appendAudit(entry: AuditEntry): void {
  try {
    const line = JSON.stringify({
      ...entry,
      preview: redact(entry.preview),
      detail: entry.detail ? redact(entry.detail) : undefined
    })
    appendFileSync(auditPath(), line + '\n', 'utf8')
  } catch (err) {
    console.warn('[LocalPilot] audit write failed', err)
  }
}

export function readRecentAudit(limit = 40): AuditEntry[] {
  try {
    const path = auditPath()
    if (!existsSync(path)) return []
    const lines = readFileSync(path, 'utf8').trim().split(/\n/).filter(Boolean)
    return lines.slice(-limit).map((line) => JSON.parse(line) as AuditEntry).reverse()
  } catch {
    return []
  }
}

function redact(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
    .replace(/api[_-]?key["\s:=]+[a-zA-Z0-9._-]+/gi, 'api_key=***')
    .replace(/password["\s:=]+\S+/gi, 'password=***')
}
