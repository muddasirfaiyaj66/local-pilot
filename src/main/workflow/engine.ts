import { randomUUID } from 'node:crypto'
import type { WorkflowDefinition, WorkflowNode, WorkflowRun } from '@shared/workflow'
import { validateWorkflow } from './validate'

export interface WorkflowExecutionContext {
  signal: AbortSignal
  execute: (node: WorkflowNode, input: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>
  checkpoint: (run: WorkflowRun) => void
  waitWhilePaused?: () => Promise<void>
}

function copy(run: WorkflowRun): WorkflowRun { return structuredClone(run) }

export function createWorkflowRun(definition: WorkflowDefinition, input: Record<string, unknown> = {}): WorkflowRun {
  const now = Date.now()
  return {
    id: randomUUID(), workflowId: definition.id, workflowVersion: definition.version,
    status: 'pending', createdAt: now, updatedAt: now, input,
    nodeRuns: Object.fromEntries(definition.nodes.map((node) => [node.id, { nodeId: node.id, status: 'pending', attempt: 0 }]))
  }
}

/** Main-process DAG runner. Every state transition is checkpointed before the next action. */
export async function executeWorkflow(definition: WorkflowDefinition, run: WorkflowRun, ctx: WorkflowExecutionContext): Promise<WorkflowRun> {
  const validation = validateWorkflow(definition)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]))
  const edgesTo = (id: string) => definition.edges.filter((edge) => edge.target === id)
  const publish = (): void => { run.updatedAt = Date.now(); ctx.checkpoint(copy(run)) }
  if (run.status === 'pending' || run.status === 'paused') {
    run.status = 'running'; run.startedAt ??= Date.now(); publish()
  }
  const completed = new Set(['succeeded', 'skipped', 'failed', 'cancelled', 'unknown'])
  const runNode = async (id: string): Promise<void> => {
    const node = nodes.get(id)!
    const state = run.nodeRuns[id]!
    const incoming = edgesTo(id)
    const active = incoming.filter((edge) => {
      const source = run.nodeRuns[edge.source]
      if (source?.status !== 'succeeded') return false
      if (!edge.branch) return true
      return source.output?.branch === edge.branch
    })
    const requiredReady = incoming.filter((edge) => !edge.branch).every((edge) => run.nodeRuns[edge.source]?.status === 'succeeded')
    const conditionalSources = [...new Set(incoming.filter((edge) => edge.branch).map((edge) => edge.source))]
    const branchesReady = conditionalSources.every((source) => active.some((edge) => edge.source === source))
    if (incoming.length && (!requiredReady || !branchesReady || active.length === 0)) {
      state.status = 'skipped'; state.finishedAt = Date.now(); publish(); return
    }
    const input: Record<string, unknown> = incoming.length
      ? Object.fromEntries(active.map((edge) => [edge.source, run.nodeRuns[edge.source]?.output ?? {}]))
      : (run.input ?? {})
    state.input = input
    const attempts = node.kind === 'tool' || node.kind === 'agent' || node.kind === 'approval' || node.kind === 'custom' || node.kind === 'subworkflow' ? 1 : (node.retry?.maxAttempts ?? 1)
    for (let attempt = state.attempt + 1; attempt <= attempts; attempt++) {
      state.status = 'running'; state.attempt = attempt; state.startedAt ??= Date.now(); publish()
      const ctrl = new AbortController()
      const abort = (): void => ctrl.abort()
      ctx.signal.addEventListener('abort', abort, { once: true })
      const timeoutMs = node.timeoutMs ?? (node.kind === 'tool' || node.kind === 'custom' ? 120_000 : node.kind === 'agent' || node.kind === 'subworkflow' ? 3_600_000 : undefined)
      const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined
      let operationCompleted = false
      try {
        const operation = ctx.execute(node, input, ctrl.signal)
        const rawOutput = timeoutMs
          ? await Promise.race([operation, new Promise<never>((_resolve, reject) => {
              ctrl.signal.addEventListener('abort', () => reject(new Error('Node timed out or cancelled')), { once: true })
            })])
          : await operation
        operationCompleted = true
        const serialized = JSON.stringify(rawOutput)
        if (!serialized || serialized.length > 100_000) throw new Error('Node output is not bounded JSON data')
        state.output = JSON.parse(serialized) as Record<string, unknown>
        if (ctx.signal.aborted) throw new Error('Cancelled')
        if (ctrl.signal.aborted) throw new Error('Node timed out')
        state.status = 'succeeded'; state.error = undefined; state.finishedAt = Date.now(); publish()
        break
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error)
        const sideEffect = node.kind === 'tool' || node.kind === 'agent' || node.kind === 'custom' || node.kind === 'subworkflow'
        state.status = sideEffect && (ctrl.signal.aborted || operationCompleted) ? 'unknown' : ctx.signal.aborted ? 'cancelled' : 'failed'
        state.finishedAt = Date.now(); publish()
        if (ctx.signal.aborted || state.status === 'unknown' || attempt === attempts) break
        const backoff = node.retry?.backoffMs ?? 0
        if (backoff) await new Promise((resolve) => setTimeout(resolve, backoff))
      } finally {
        if (timer) clearTimeout(timer)
        ctx.signal.removeEventListener('abort', abort)
      }
    }
    if (node.kind === 'output') run.output = state.output
  }
  while (true) {
    if (ctx.signal.aborted) break
    await ctx.waitWhilePaused?.()
    if (ctx.signal.aborted) break
    const pending = validation.order.filter((id) => run.nodeRuns[id]?.status === 'pending')
    if (!pending.length) break
    const ready = pending.filter((id) => edgesTo(id).every((edge) => completed.has(run.nodeRuns[edge.source]?.status ?? 'pending')))
    if (!ready.length) throw new Error('Workflow scheduler stalled')
    const first = nodes.get(ready[0]!)!
    const exclusive = new Set(['tool', 'agent', 'approval', 'subworkflow', 'custom'])
    const batch = exclusive.has(first.kind) ? ready.slice(0, 1) : ready.filter((id) => !exclusive.has(nodes.get(id)!.kind)).slice(0, 2)
    await Promise.all(batch.map(runNode))
    const failed = Object.values(run.nodeRuns).find((state) => state.status === 'failed' || state.status === 'unknown' || state.status === 'cancelled')
    if (failed) {
      run.status = failed.status === 'unknown' ? 'unknown' : ctx.signal.aborted ? 'cancelled' : 'failed'
      run.error = failed.error
      run.finishedAt = Date.now(); publish(); return run
    }
  }
  run.status = ctx.signal.aborted ? 'cancelled' : 'succeeded'
  run.finishedAt = Date.now()
  publish()
  return run
}
