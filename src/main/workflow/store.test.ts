import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowRun } from '@shared/workflow'
import {
  checkpointWorkflowRun,
  createRun,
  deleteDefinition,
  getDefinition,
  getDefinitionRevision,
  getRun,
  getRunDefinition,
  listDefinitions,
  listDefinitionRevisions,
  listWorkflowEvents,
  recoverInterruptedWorkflowRuns,
  saveDefinition
} from './store'

function definition(): WorkflowDefinition {
  return {
    id: randomUUID(), name: 'Original', version: 1,
    nodes: [{ id: 'start', kind: 'input', label: 'Start', position: { x: 0, y: 0 }, config: {} }],
    edges: [], createdAt: 1, updatedAt: 1
  }
}

function run(graph: WorkflowDefinition): WorkflowRun {
  return {
    id: randomUUID(), workflowId: graph.id, workflowVersion: graph.version,
    status: 'running', createdAt: 2, updatedAt: 2,
    nodeRuns: { start: { nodeId: 'start', status: 'running', attempt: 1, startedAt: 2 } }
  }
}

describe('workflow storage', () => {
  it('saves, updates, lists and deletes graph definitions', () => {
    const graph = definition()
    saveDefinition(graph)
    expect(getDefinition(graph.id)).toEqual(graph)
    expect(listDefinitions().some((item) => item.id === graph.id)).toBe(true)

    const edited = { ...graph, name: 'Edited', updatedAt: 3 }
    saveDefinition(edited)
    expect(getDefinition(graph.id, 1)?.name).toBe('Edited')
    expect(listDefinitionRevisions(graph.id).map((revision) => revision.definition.name)).toEqual(['Edited', 'Original'])
    expect(getDefinitionRevision(graph.id, 1)?.definition.name).toBe('Original')
    saveDefinition(edited)
    expect(listDefinitionRevisions(graph.id)).toHaveLength(2)
    expect(deleteDefinition(graph.id)).toBe(true)
    expect(getDefinition(graph.id)).toBeNull()
    expect(getDefinitionRevision(graph.id, 2)?.definition.name).toBe('Edited')
  })

  it('pins the graph snapshot and checkpoints a run with its event', () => {
    const graph = definition()
    saveDefinition(graph)
    const started = run(graph)
    createRun(started, graph)
    saveDefinition({ ...graph, name: 'Changed later', updatedAt: 4 })
    expect(getRunDefinition(started.id)?.name).toBe('Original')

    const finished: WorkflowRun = {
      ...started, status: 'succeeded', updatedAt: 5, finishedAt: 5,
      nodeRuns: { start: { ...started.nodeRuns.start!, status: 'succeeded', finishedAt: 5 } }
    }
    const event = checkpointWorkflowRun(finished, 'node_succeeded', { nodeId: 'start' })
    expect(getRun(started.id)).toEqual(finished)
    expect(listWorkflowEvents(started.id)).toEqual([event])
    expect(listWorkflowEvents(started.id, event.id)).toEqual([])
    const second = checkpointWorkflowRun(finished, 'run_completed', { ok: true })
    expect(listWorkflowEvents(started.id, event.id, 1)).toEqual([second])
  })

  it('pauses interrupted runs and marks in-flight node outcome unknown', () => {
    const graph = definition()
    const started = run(graph)
    createRun(started, graph)
    const recovered = recoverInterruptedWorkflowRuns().find((item) => item.id === started.id)
    expect(recovered?.status).toBe('paused')
    expect(recovered?.nodeRuns.start?.status).toBe('unknown')
    expect(getRun(started.id)?.status).toBe('paused')
    expect(listWorkflowEvents(started.id).at(-1)?.type).toBe('run_recovered')
    expect(recoverInterruptedWorkflowRuns().some((item) => item.id === started.id)).toBe(false)
  })

  it('keeps a waiting agent outcome unknown after restart', () => {
    const graph = definition()
    graph.nodes[0] = { id: 'start', kind: 'agent', label: 'Agent', position: { x: 0, y: 0 }, config: { goal: 'Work', mode: 'agent' } }
    const started = run(graph)
    started.status = 'waiting'
    started.nodeRuns.start!.status = 'waiting'
    createRun(started, graph)
    const recovered = recoverInterruptedWorkflowRuns().find((item) => item.id === started.id)
    expect(recovered?.nodeRuns.start?.status).toBe('unknown')
  })
})
