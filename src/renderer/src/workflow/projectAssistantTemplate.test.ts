import { describe, expect, it } from 'vitest'
import { WorkflowDefinitionSchema } from '@shared/workflow'
import { createProjectAssistantTemplate } from './projectAssistantTemplate'

describe('project assistant template', () => {
  it('creates valid editable graphs with unique IDs', () => {
    const first = createProjectAssistantTemplate()
    const second = createProjectAssistantTemplate()
    expect(WorkflowDefinitionSchema.safeParse(first).success).toBe(true)
    expect(first.id).not.toBe(second.id)
    expect(first.nodes.map((node) => node.id)).not.toEqual(second.nodes.map((node) => node.id))
    expect(new Set(first.nodes.map((node) => node.id)).size).toBe(first.nodes.length)
    expect(new Set(first.edges.map((edge) => edge.id)).size).toBe(first.edges.length)
    expect(first.edges.every((edge) => first.nodes.some((node) => node.id === edge.source) && first.nodes.some((node) => node.id === edge.target))).toBe(true)
  })

  it('routes both verification outcomes to separate output nodes', () => {
    const graph = createProjectAssistantTemplate()
    const condition = graph.nodes.find((node) => node.kind === 'condition')!
    const branches = graph.edges.filter((edge) => edge.source === condition.id)
    expect(branches.map((edge) => edge.branch).sort()).toEqual(['false', 'true'])
    expect(graph.nodes.find((node) => node.id === branches.find((edge) => edge.branch === 'true')!.target)?.kind).toBe('output')
    expect(graph.nodes.find((node) => node.id === branches.find((edge) => edge.branch === 'false')!.target)?.kind).toBe('approval')
  })
})
