import { z } from 'zod'

/** Persisted definitions are versioned independently from legacy text workflows. */
export const WorkflowRetrySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(1),
  backoffMs: z.number().int().min(0).max(300_000).default(0)
}).strict()
export type WorkflowRetry = z.infer<typeof WorkflowRetrySchema>

const NodeBaseSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  timeoutMs: z.number().int().min(100).max(3_600_000).optional(),
  retry: WorkflowRetrySchema.optional()
})

export const WorkflowNodeSchema = z.discriminatedUnion('kind', [
  NodeBaseSchema.extend({ kind: z.literal('input'), config: z.object({}).strict() }),
  NodeBaseSchema.extend({
    kind: z.literal('agent'),
    config: z.object({ goal: z.string().min(1).max(20_000), providerId: z.string().min(1).optional(), route: z.enum(['fast', 'strong', 'vision']).optional(), mode: z.enum(['agent', 'plan']).default('agent') }).strict()
  }),
  NodeBaseSchema.extend({
    kind: z.literal('tool'),
    config: z.object({ toolName: z.string().min(1), arguments: z.record(z.unknown()).default({}) }).strict()
  }),
  NodeBaseSchema.extend({
    kind: z.literal('condition'),
    config: z.object({ path: z.string().min(1), operator: z.enum(['equals', 'not_equals', 'exists', 'contains']), value: z.unknown().optional() }).strict()
  }),
  NodeBaseSchema.extend({ kind: z.literal('approval'), config: z.object({ prompt: z.string().min(1).max(4_000) }).strict() }),
  NodeBaseSchema.extend({ kind: z.literal('delay'), config: z.object({ durationMs: z.number().int().min(0).max(86_400_000) }).strict() }),
  NodeBaseSchema.extend({ kind: z.literal('output'), config: z.object({}).strict() }),
  NodeBaseSchema.extend({ kind: z.literal('subworkflow'), config: z.object({ workflowId: z.string().min(1) }).strict() }),
  NodeBaseSchema.extend({ kind: z.literal('custom'), config: z.object({ type: z.string().min(1).max(120), input: z.record(z.unknown()).default({}) }).strict() })
])
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>
export type WorkflowNodeKind = WorkflowNode['kind']

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1).max(120),
  target: z.string().min(1).max(120),
  branch: z.enum(['true', 'false']).optional()
}).strict()
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  version: z.literal(1),
  nodes: z.array(WorkflowNodeSchema).min(1).max(200),
  edges: z.array(WorkflowEdgeSchema).max(500),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
}).strict()
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>

export const WorkflowRunStatusSchema = z.enum(['pending', 'running', 'waiting', 'paused', 'succeeded', 'failed', 'cancelled', 'unknown'])
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>
export const WorkflowNodeStatusSchema = z.enum(['pending', 'running', 'waiting', 'paused', 'succeeded', 'failed', 'cancelled', 'skipped', 'unknown'])
export type WorkflowNodeStatus = z.infer<typeof WorkflowNodeStatusSchema>

export const WorkflowNodeRunSchema = z.object({
  nodeId: z.string().min(1),
  status: WorkflowNodeStatusSchema,
  attempt: z.number().int().nonnegative(),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional()
}).strict()
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>

export const WorkflowRunSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  workflowVersion: z.literal(1),
  status: WorkflowRunStatusSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  nodeRuns: z.record(WorkflowNodeRunSchema),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional()
}).strict()
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>
