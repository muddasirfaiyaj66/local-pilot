import { WorkflowDefinitionSchema, type WorkflowDefinition } from '@shared/workflow'

export interface WorkflowValidation {
  valid: boolean
  errors: string[]
  order: string[]
}

/** Validate structure before any privileged node is scheduled. */
export function validateWorkflow(raw: unknown): WorkflowValidation {
  const parsed = WorkflowDefinitionSchema.safeParse(raw)
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`), order: [] }
  }
  const workflow: WorkflowDefinition = parsed.data
  const errors: string[] = []
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]))
  const ids = new Set<string>()
  for (const node of workflow.nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate node ID: ${node.id}`)
    ids.add(node.id)
  }
  const edgeIds = new Set<string>()
  const incoming = new Map([...ids].map((id) => [id, 0]))
  const outgoing = new Map([...ids].map((id) => [id, [] as string[]]))
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) errors.push(`Duplicate edge ID: ${edge.id}`)
    edgeIds.add(edge.id)
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push(`Edge ${edge.id} references a missing node`)
      continue
    }
    if (edge.source === edge.target) errors.push(`Node ${edge.source} cannot depend on itself`)
    if (edge.branch && byId.get(edge.source)?.kind !== 'condition') errors.push(`Edge ${edge.id} has a branch but source is not a condition`)
    if (byId.get(edge.source)?.kind === 'condition' && !edge.branch) errors.push(`Edge ${edge.id} from a condition needs a branch`)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of outgoing.get(id) ?? []) {
      const count = (incoming.get(next) ?? 0) - 1
      incoming.set(next, count)
      if (count === 0) queue.push(next)
    }
  }
  if (order.length !== ids.size) errors.push('Workflow contains a cycle')
  for (const node of workflow.nodes.filter((item) => item.kind === 'condition')) {
    const branches = workflow.edges.filter((edge) => edge.source === node.id).map((edge) => edge.branch)
    if (!branches.includes('true') || !branches.includes('false')) errors.push(`Condition ${node.id} requires true and false branches`)
  }
  if (workflow.nodes.length === 0) errors.push('Workflow requires at least one node')
  return { valid: errors.length === 0, errors, order: errors.length ? [] : order }
}
