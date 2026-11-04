import type { BrowserWindow } from 'electron'
import type { WorkflowDefinition, WorkflowNode, WorkflowRun } from '@shared/workflow'
import type { SettingsStore } from '../settings'
import { runAgentLoop } from '../agent/loop'
import { createProvider } from '../providers/registry'
import { getTool } from '../tools/registry'
import { classifyToolRisk, shouldAutoAllow } from '../safety/permissions'
import { appendAudit } from '../safety/audit'
import { createWorkflowRun, executeWorkflow } from './engine'
import { checkpointWorkflowRun, createRun, getDefinition, getRun, getRunDefinition, recoverInterruptedWorkflowRuns } from './store'
import { validateWorkflow } from './validate'
import { getCustomWorkflowNode } from './registry'

type Approval = { runId: string; nodeId: string; prompt: string; resolve: (allowed: boolean) => void }
type Question = { runId: string; nodeId: string; prompt: string; resolve: (answer: string) => void }
const active = new Map<string, { controller: AbortController; paused: boolean; wake?: () => void }>()
const completions = new Map<string, Promise<void>>()
const approvals = new Map<string, Approval>()
const questions = new Map<string, Question>()
let privilegedTail: Promise<void> = Promise.resolve()

async function withPrivilegedSlot<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  const previous = privilegedTail
  let release!: () => void
  privilegedTail = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    if (signal.aborted) throw new Error('Cancelled')
    return await action()
  } finally { release() }
}

export function recoverWorkflows(): void { recoverInterruptedWorkflowRuns() }
export function respondWorkflowApproval(runId: string, nodeId: string, allowed: boolean): void {
  const key = `${runId}:${nodeId}`
  const approval = approvals.get(key)
  if (!approval) return
  approvals.delete(key)
  approval.resolve(allowed)
}
export function answerWorkflowQuestion(runId: string, nodeId: string, answer: string): void {
  const key = `${runId}:${nodeId}`
  const question = questions.get(key)
  if (!question) return
  questions.delete(key)
  question.resolve(answer)
}
export function pauseWorkflow(runId: string): void {
  const session = active.get(runId)
  if (session) {
    session.paused = true
    const run = getRun(runId)
    if (run?.status === 'running') { run.status = 'paused'; run.updatedAt = Date.now(); checkpointWorkflowRun(run, 'pause_requested') }
  }
}
export function resumeWorkflow(runId: string): void {
  const session = active.get(runId)
  if (session) {
    session.paused = false; session.wake?.(); session.wake = undefined
    const run = getRun(runId)
    if (run?.status === 'paused') { run.status = 'running'; run.updatedAt = Date.now(); checkpointWorkflowRun(run, 'run_resumed') }
  }
}
export function resumeStoredWorkflow(runId: string, store: SettingsStore, window: BrowserWindow | null): void {
  if (active.has(runId)) { resumeWorkflow(runId); return }
  const run = getRun(runId)
  const definition = getRunDefinition(runId)
  if (!run || !definition) throw new Error('Workflow run not found')
  if (run.status !== 'paused') throw new Error('Only paused runs can resume')
  if (Object.values(run.nodeRuns).some((node) => node.status === 'unknown' || node.status === 'running')) {
    throw new Error('Run has an unknown node outcome; review before replay')
  }
  const session = { controller: new AbortController(), paused: false, wake: undefined as (() => void) | undefined }
  active.set(run.id, session)
  const completion = runWorkflow(definition, run, store, window, session)
  completions.set(run.id, completion)
  void completion.finally(() => completions.delete(run.id))
}
/** Explicit user decision is required because the previous side effect may already have occurred. */
export function replayUnknownWorkflowNode(runId: string, nodeId: string, store: SettingsStore, window: BrowserWindow | null): void {
  const run = getRun(runId)
  if (!run || (run.status !== 'paused' && run.status !== 'unknown')) throw new Error('Run is not available for replay')
  const node = run.nodeRuns[nodeId]
  if (!node || node.status !== 'unknown') throw new Error('Node outcome is not unknown')
  node.status = 'pending'; node.error = undefined; node.output = undefined; node.finishedAt = undefined; node.attempt = 0
  run.status = 'paused'; run.error = undefined; run.finishedAt = undefined; run.updatedAt = Date.now()
  checkpointWorkflowRun(run, 'manual_replay', { nodeId })
  resumeStoredWorkflow(runId, store, window)
}
export function cancelWorkflow(runId: string): void {
  const session = active.get(runId)
  session?.controller.abort()
  session?.wake?.()
  for (const [key, approval] of approvals) if (approval.runId === runId) { approvals.delete(key); approval.resolve(false) }
  for (const [key, question] of questions) if (question.runId === runId) { questions.delete(key); question.resolve('') }
}
export function cancelAllWorkflows(): void { for (const id of active.keys()) cancelWorkflow(id) }

async function askApproval(runId: string, nodeId: string, prompt: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false
  return new Promise<boolean>((resolve) => {
    const key = `${runId}:${nodeId}`
    const onAbort = (): void => { approvals.delete(key); resolve(false) }
    signal.addEventListener('abort', onAbort, { once: true })
    approvals.set(key, { runId, nodeId, prompt, resolve: (allowed) => { signal.removeEventListener('abort', onAbort); resolve(allowed) } })
  })
}
async function askQuestion(runId: string, nodeId: string, prompt: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return ''
  return new Promise<string>((resolve) => {
    const key = `${runId}:${nodeId}`
    const onAbort = (): void => { questions.delete(key); resolve('') }
    signal.addEventListener('abort', onAbort, { once: true })
    questions.set(key, { runId, nodeId, prompt, resolve: (answer) => { signal.removeEventListener('abort', onAbort); resolve(answer) } })
  })
}

export function pendingWorkflowApprovals(runId: string): Array<{ nodeId: string; prompt: string; kind: 'approval' | 'question' }> {
  return [
    ...[...approvals.values()].filter((a) => a.runId === runId).map((a) => ({ nodeId: a.nodeId, prompt: a.prompt, kind: 'approval' as const })),
    ...[...questions.values()].filter((a) => a.runId === runId).map((a) => ({ nodeId: a.nodeId, prompt: a.prompt, kind: 'question' as const }))
  ]
}
export function dryRunWorkflow(workflowId: string): Array<{ nodeId: string; kind: WorkflowNode['kind']; label: string; risk?: string }> {
  const definition = getDefinition(workflowId)
  if (!definition) throw new Error('Workflow not found')
  const checked = validateWorkflow(definition)
  if (!checked.valid) throw new Error(checked.errors.join('; '))
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]))
  return checked.order.map((id) => {
    const node = nodes.get(id)!
    const risk = node.kind === 'tool' ? (() => {
      const tool = getTool(node.config.toolName)
      return tool ? classifyToolRisk(tool, node.config.arguments) : undefined
    })() : undefined
    return { nodeId: id, kind: node.kind, label: node.label, risk }
  })
}

function valueAtPath(input: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, part) ? (value as Record<string, unknown>)[part] : undefined, input)
}
function resolveValue(value: unknown, input: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = /^\{\{([a-zA-Z0-9_.-]+)\}\}$/.exec(value)
    if (exact) return valueAtPath(input, exact[1]!)
    return value.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, path: string) => {
      const result = valueAtPath(input, path)
      return result === undefined ? '' : typeof result === 'string' ? result : JSON.stringify(result)
    })
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, input))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, input)]))
  return value
}

export function startWorkflow(workflowId: string, input: Record<string, unknown>, store: SettingsStore, window: BrowserWindow | null): WorkflowRun {
  if (active.size >= 4) throw new Error('Workflow concurrency limit reached (4)')
  const definition = getDefinition(workflowId)
  if (!definition) throw new Error(`Workflow not found: ${workflowId}`)
  const checked = validateWorkflow(definition)
  if (!checked.valid) throw new Error(checked.errors.join('; '))
  const run = createWorkflowRun(definition, input)
  createRun(run, definition)
  const session = { controller: new AbortController(), paused: false, wake: undefined as (() => void) | undefined }
  active.set(run.id, session)
  const completion = runWorkflow(definition, run, store, window, session)
  completions.set(run.id, completion)
  void completion.finally(() => completions.delete(run.id))
  return run
}
export function waitForWorkflow(runId: string): Promise<void> { return completions.get(runId) ?? Promise.resolve() }

async function runWorkflow(definition: WorkflowDefinition, run: WorkflowRun, store: SettingsStore, window: BrowserWindow | null, session: { controller: AbortController; paused: boolean; wake?: () => void }, ancestry: string[] = [definition.id]): Promise<void> {
  const controller = session.controller
  const checkpoint = (state: WorkflowRun): void => {
    checkpointWorkflowRun(state, 'run_checkpoint', { status: state.status })
    if (window && !window.isDestroyed()) window.webContents.send('workflow:event', state)
  }
  try {
    await executeWorkflow(definition, run, {
      signal: controller.signal,
      checkpoint,
      waitWhilePaused: async () => {
        if (!session.paused) return
        run.status = 'paused'; checkpoint(run)
        await new Promise<void>((resolve) => { session.wake = resolve })
        if (!controller.signal.aborted) { run.status = 'running'; checkpoint(run) }
      },
      execute: async (node, nodeInput, signal) => {
        const action = (): Promise<Record<string, unknown>> => executeNode(node, nodeInput, signal, run.id, store, checkpoint, run, window, ancestry)
        return node.kind === 'agent' || node.kind === 'tool' || node.kind === 'custom'
          ? withPrivilegedSlot(signal, action) : action()
      }
    })
  } catch (error) {
    run.status = controller.signal.aborted ? 'cancelled' : 'unknown'
    run.error = error instanceof Error ? error.message : String(error)
    run.finishedAt = Date.now()
    try { checkpoint(run) } catch (checkpointError) { console.warn('[LocalPilot] Workflow checkpoint failed', checkpointError) }
  } finally {
    active.delete(run.id)
    for (const [key, approval] of approvals) if (approval.runId === run.id) { approvals.delete(key); approval.resolve(false) }
    for (const [key, question] of questions) if (question.runId === run.id) { questions.delete(key); question.resolve('') }
  }
}

async function executeNode(node: WorkflowNode, input: Record<string, unknown>, signal: AbortSignal, runId: string, store: SettingsStore, checkpoint: (run: WorkflowRun) => void, run: WorkflowRun, window: BrowserWindow | null, ancestry: string[]): Promise<Record<string, unknown>> {
  if (node.kind === 'input' || node.kind === 'output') return input
  if (node.kind === 'delay') {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, node.config.durationMs)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Cancelled')) }, { once: true })
    })
    return input
  }
  if (node.kind === 'condition') {
    const value = valueAtPath(input, node.config.path)
    const expected = node.config.value
    const result = node.config.operator === 'exists' ? value !== undefined
      : node.config.operator === 'equals' ? value === expected
      : node.config.operator === 'not_equals' ? value !== expected
      : typeof value === 'string' && String(value).includes(String(expected))
    return { branch: result ? 'true' : 'false', value }
  }
  if (node.kind === 'subworkflow') {
    const childDefinition = getDefinition(node.config.workflowId)
    if (!childDefinition) throw new Error(`Nested workflow unavailable: ${node.config.workflowId}`)
    if (ancestry.includes(childDefinition.id) || ancestry.length >= 5) throw new Error('Nested workflow cycle or depth limit')
    const child = createWorkflowRun(childDefinition, input)
    createRun(child, childDefinition)
    const childSession = { controller: new AbortController(), paused: false, wake: undefined as (() => void) | undefined }
    const abortChild = (): void => childSession.controller.abort()
    signal.addEventListener('abort', abortChild, { once: true })
    active.set(child.id, childSession)
    try { await runWorkflow(childDefinition, child, store, window, childSession, [...ancestry, childDefinition.id]) }
    finally { signal.removeEventListener('abort', abortChild) }
    if (child.status !== 'succeeded') throw new Error(child.error ?? `Nested workflow ${child.status}`)
    return child.output ?? {}
  }
  if (node.kind === 'custom') {
    const extension = getCustomWorkflowNode(node.config.type)
    if (!extension) throw new Error(`Custom node unavailable: ${node.config.type}`)
    const config = extension.configSchema.parse(node.config.input)
    return extension.execute({ input, config, signal })
  }
  if (node.kind === 'approval') {
    run.nodeRuns[node.id]!.status = 'waiting'; run.status = 'waiting'; checkpoint(run)
    const allowed = await askApproval(runId, node.id, node.config.prompt, signal)
    run.status = 'running'; checkpoint(run)
    if (!allowed) throw new Error('Approval denied')
    return { approved: true }
  }
  if (node.kind === 'agent') {
    const settings = store.getSettings()
    const route = node.config.route ?? 'strong'
    const routedId = route === 'fast' ? settings.modelRouting.fastProviderId
      : route === 'vision' ? settings.modelRouting.visionProviderId
      : settings.modelRouting.strongProviderId
    const providerId = node.config.providerId || routedId || settings.activeProviderId
    const config = providerId ? store.getProvider(providerId) : undefined
    if (!config?.enabled || (route === 'vision' && !config.visionEnabled)) throw new Error('Configured agent provider is unavailable')
    const provider = createProvider(config, store.getApiKey(config.id))
    const goal = node.config.goal.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, path: string) => `the value at upstream data path ${path}`)
    const result = await runAgentLoop({
      provider, goal, workflowData: input, workspacePath: settings.workspacePath,
      permissionMode: settings.permissionMode, mode: node.config.mode,
      maxSteps: settings.maxAgentSteps, signal, onEvent: () => undefined,
      requestPermission: async (permission) => askApproval(runId, node.id, `${permission.toolName} (${permission.risk})\n${permission.preview}`, signal),
      askUser: async (question) => {
        run.nodeRuns[node.id]!.status = 'waiting'; run.status = 'waiting'; checkpoint(run)
        const answer = await askQuestion(runId, node.id, question, signal)
        run.status = 'running'; checkpoint(run)
        return answer
      }
    })
    if (result.status !== 'success') throw new Error(result.summary)
    return { summary: result.summary }
  }
  if (node.kind === 'tool') {
    const tool = getTool(node.config.toolName)
    if (!tool) throw new Error(`Tool unavailable: ${node.config.toolName}`)
    const args = tool.parameters.parse(resolveValue(node.config.arguments, input)) as Record<string, unknown>
    const risk = classifyToolRisk(tool, args)
    const preview = tool.preview(args)
    if (!shouldAutoAllow(store.getSettings().permissionMode, risk)) {
      run.nodeRuns[node.id]!.status = 'waiting'; run.status = 'waiting'; checkpoint(run)
      const allowed = await askApproval(runId, node.id, `${tool.name} (${risk})\n${preview}`, signal)
      run.status = 'running'; checkpoint(run)
      if (!allowed) throw new Error('Tool permission denied')
    }
    const result = await tool.execute(args, { workspacePath: store.getSettings().workspacePath, signal, allowOutsideWorkspace: false })
    appendAudit({ timestamp: Date.now(), requestId: runId, toolName: tool.name, risk, preview, ok: result.ok, detail: result.error })
    if (!result.ok) throw new Error(result.error ?? result.output)
    return { output: result.output.slice(0, 100_000) }
  }
  throw new Error('Unsupported workflow node')
}
