import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition } from '@shared/workflow'
import { createWorkflowRun, executeWorkflow } from './engine'
import { validateWorkflow } from './validate'

const definition = (): WorkflowDefinition => ({
  id: 'flow', name: 'Flow', version: 1, createdAt: 1, updatedAt: 1,
  nodes: [
    { id: 'in', kind: 'input', label: 'Input', config: {}, position: { x: 0, y: 0 } },
    { id: 'step', kind: 'delay', label: 'Step', config: { durationMs: 0 }, position: { x: 1, y: 0 } },
    { id: 'out', kind: 'output', label: 'Output', config: {}, position: { x: 2, y: 0 } }
  ],
  edges: [{ id: 'a', source: 'in', target: 'step' }, { id: 'b', source: 'step', target: 'out' }]
})

describe('workflow engine', () => {
  it('rejects cycles and missing nodes', () => {
    const cyclic = definition()
    cyclic.edges.push({ id: 'c', source: 'out', target: 'in' })
    expect(validateWorkflow(cyclic).errors).toContain('Workflow contains a cycle')
    const missing = definition()
    missing.edges.push({ id: 'c', source: 'ghost', target: 'out' })
    expect(validateWorkflow(missing).valid).toBe(false)
  })

  it('runs dependencies in order and checkpoints transitions', async () => {
    const graph = definition()
    const run = createWorkflowRun(graph, { value: 7 })
    const calls: string[] = []
    const snapshots: string[] = []
    const finished = await executeWorkflow(graph, run, {
      signal: new AbortController().signal,
      checkpoint: (state) => snapshots.push(state.status),
      execute: async (node, input) => { calls.push(node.id); return input }
    })
    expect(calls).toEqual(['in', 'step', 'out'])
    expect(finished.status).toBe('succeeded')
    expect(finished.output).toEqual({ step: { in: { value: 7 } } })
    expect(snapshots.length).toBeGreaterThan(3)
  })

  it('does not retry side-effect nodes even if a retry policy is configured', async () => {
    const graph = definition()
    graph.nodes[1] = { id: 'step', kind: 'tool', label: 'Tool', config: { toolName: 'noop', arguments: {} }, retry: { maxAttempts: 3, backoffMs: 0 }, position: { x: 1, y: 0 } }
    let calls = 0
    const finished = await executeWorkflow(graph, createWorkflowRun(graph), {
      signal: new AbortController().signal,
      checkpoint: () => undefined,
      execute: async (node) => { if (node.kind === 'tool') { calls++; throw new Error('failed') } return {} }
    })
    expect(calls).toBe(1)
    expect(finished.status).toBe('failed')
  })

  it('runs independent safe nodes concurrently and joins their outputs', async () => {
    const graph = definition()
    graph.nodes.splice(1, 1,
      { id: 'a', kind: 'delay', label: 'A', config: { durationMs: 0 }, position: { x: 1, y: 0 } },
      { id: 'b', kind: 'delay', label: 'B', config: { durationMs: 0 }, position: { x: 1, y: 1 } })
    graph.edges = [
      { id: 'a1', source: 'in', target: 'a' }, { id: 'b1', source: 'in', target: 'b' },
      { id: 'a2', source: 'a', target: 'out' }, { id: 'b2', source: 'b', target: 'out' }
    ]
    let running = 0
    let peak = 0
    const result = await executeWorkflow(graph, createWorkflowRun(graph), {
      signal: new AbortController().signal, checkpoint: () => undefined,
      execute: async (node, input) => {
        running++; peak = Math.max(peak, running)
        if (node.id === 'a' || node.id === 'b') await new Promise((resolve) => setTimeout(resolve, 10))
        running--
        return input
      }
    })
    expect(result.status).toBe('succeeded')
    expect(peak).toBe(2)
    expect(result.nodeRuns.out?.input).toHaveProperty('a')
    expect(result.nodeRuns.out?.input).toHaveProperty('b')
  })

  it('runs only the selected condition branch', async () => {
    const graph = definition()
    graph.nodes = [
      { id: 'in', kind: 'input', label: 'Input', config: {}, position: { x: 0, y: 0 } },
      { id: 'if', kind: 'condition', label: 'If', config: { path: 'in.enabled', operator: 'equals', value: true }, position: { x: 1, y: 0 } },
      { id: 'yes', kind: 'delay', label: 'Yes', config: { durationMs: 0 }, position: { x: 2, y: 0 } },
      { id: 'no', kind: 'delay', label: 'No', config: { durationMs: 0 }, position: { x: 2, y: 1 } }
    ]
    graph.edges = [
      { id: 'a', source: 'in', target: 'if' },
      { id: 'b', source: 'if', target: 'yes', branch: 'true' },
      { id: 'c', source: 'if', target: 'no', branch: 'false' }
    ]
    const calls: string[] = []
    const result = await executeWorkflow(graph, createWorkflowRun(graph, { enabled: true }), {
      signal: new AbortController().signal, checkpoint: () => undefined,
      execute: async (node, input) => {
        calls.push(node.id)
        return node.kind === 'condition' ? { branch: 'true' } : input
      }
    })
    expect(result.status).toBe('succeeded')
    expect(calls).toEqual(['in', 'if', 'yes'])
    expect(result.nodeRuns.no?.status).toBe('skipped')
  })

  it('marks an interrupted tool outcome unknown instead of replaying it', async () => {
    const graph = definition()
    graph.nodes[1] = { id: 'step', kind: 'tool', label: 'Tool', config: { toolName: 'noop', arguments: {} }, timeoutMs: 100, position: { x: 1, y: 0 } }
    const result = await executeWorkflow(graph, createWorkflowRun(graph), {
      signal: new AbortController().signal, checkpoint: () => undefined,
      execute: async (node, input, signal) => {
        if (node.kind === 'tool') {
          await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Stopped')), { once: true }))
        }
        return input
      }
    })
    expect(result.status).toBe('unknown')
    expect(result.nodeRuns.step?.status).toBe('unknown')
  })
})
