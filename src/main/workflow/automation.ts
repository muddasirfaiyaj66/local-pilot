import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { z } from 'zod'
import type { BrowserWindow } from 'electron'
import type { SettingsStore } from '../settings'
import { WorkflowTriggerManager, TriggerSchema, type Trigger } from './triggers'
import { startWorkflow, waitForWorkflow } from './service'
import { getDefinition } from './store'

const publicBase = z.object({ id: z.string().min(1).max(120), workflowId: z.string().min(1).max(120), enabled: z.boolean().default(true), dedupeMs: z.number().int().min(0).max(3_600_000).default(1000), filter: z.object({ path: z.string().min(1).max(200), equals: z.unknown() }).strict().optional() })
const PublicTriggerSchema = z.discriminatedUnion('kind', [
  publicBase.extend({ kind: z.literal('schedule'), intervalMs: z.number().int().min(1000).max(86_400_000) }).strict(),
  publicBase.extend({ kind: z.literal('filesystem'), path: z.string().min(1), recursive: z.boolean().default(false), events: z.array(z.enum(['rename','change'])).min(1).default(['rename','change']) }).strict(),
  publicBase.extend({ kind: z.literal('git'), path: z.string().min(1), intervalMs: z.number().int().min(1000).max(86_400_000) }).strict(),
  publicBase.extend({ kind: z.literal('webhook'), path: z.string().regex(/^\/[a-zA-Z0-9/_-]{1,120}$/), port: z.number().int().min(1024).max(65535) }).strict()
])
export type PublicTrigger = z.infer<typeof PublicTriggerSchema>
let triggers: Trigger[] = []
let manager: WorkflowTriggerManager | null = null
let settings: SettingsStore | null = null
let windowProvider: (() => BrowserWindow | null) | null = null

function path(): string { return join(app.getPath('userData'), 'workflow-triggers.bin') }
function persist(): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encrypted storage is required for workflow triggers')
  writeFileSync(path(), safeStorage.encryptString(JSON.stringify(triggers)))
}
function load(): Trigger[] {
  try {
    if (!existsSync(path()) || !safeStorage.isEncryptionAvailable()) return []
    return z.array(TriggerSchema).max(100).parse(JSON.parse(safeStorage.decryptString(readFileSync(path()))))
  } catch { return [] }
}
function publicTrigger(trigger: Trigger): PublicTrigger {
  if (trigger.kind === 'webhook') { const { token: _token, ...rest } = trigger; void _token; return rest }
  return trigger
}
export function listWorkflowTriggers(workflowId?: string): PublicTrigger[] {
  return triggers.filter((trigger) => !workflowId || trigger.workflowId === workflowId).map(publicTrigger)
}
export async function reloadWorkflowTriggers(): Promise<void> {
  manager?.stop()
  if (!settings || !windowProvider) return
  const workspace = settings.getSettings().workspacePath
  const next = new WorkflowTriggerManager(workspace, async (event) => {
    const run = startWorkflow(event.workflowId, { trigger: event.payload, triggerId: event.triggerId, timestamp: event.timestamp }, settings!, windowProvider!())
    await waitForWorkflow(run.id)
  })
  try { if (workspace) await next.start(triggers); manager = next }
  catch (error) { manager = null; throw error }
}
export async function initializeWorkflowTriggers(store: SettingsStore, getWindow: () => BrowserWindow | null): Promise<void> {
  settings = store; windowProvider = getWindow; triggers = load()
  await reloadWorkflowTriggers()
}
export async function saveWorkflowTrigger(raw: unknown): Promise<{ trigger: PublicTrigger; token?: string }> {
  const publicValue = PublicTriggerSchema.parse(raw)
  if (!getDefinition(publicValue.workflowId)) throw new Error('Workflow for trigger not found')
  if (publicValue.kind === 'webhook' && triggers.some((item) => item.kind === 'webhook' && item.id !== publicValue.id && item.port === publicValue.port)) {
    throw new Error('Each webhook trigger requires a unique port')
  }
  const existing = triggers.find((item) => item.id === publicValue.id)
  const token = publicValue.kind === 'webhook'
    ? existing?.kind === 'webhook' ? existing.token : randomBytes(32).toString('hex')
    : undefined
  const full = TriggerSchema.parse(token ? { ...publicValue, token } : publicValue)
  const previous = triggers
  triggers = [...triggers.filter((item) => item.id !== full.id), full]
  try { await reloadWorkflowTriggers(); persist() }
  catch (error) { triggers = previous; await reloadWorkflowTriggers().catch(() => undefined); throw error }
  return { trigger: publicTrigger(full), token: existing?.kind === 'webhook' ? undefined : token }
}
export async function deleteWorkflowTrigger(id: string): Promise<void> {
  const previous = triggers
  triggers = triggers.filter((item) => item.id !== id)
  try { await reloadWorkflowTriggers(); persist() }
  catch (error) { triggers = previous; await reloadWorkflowTriggers().catch(() => undefined); throw error }
}
export function stopWorkflowTriggers(): void { manager?.stop(); manager = null }
