import { z } from 'zod'

export interface CustomWorkflowNodeContext {
  input: Record<string, unknown>
  config: Record<string, unknown>
  signal: AbortSignal
}
export interface CustomWorkflowNode {
  type: string
  configSchema: z.ZodType<Record<string, unknown>>
  execute: (context: CustomWorkflowNodeContext) => Promise<Record<string, unknown>>
}
const customNodes = new Map<string, CustomWorkflowNode>()

/** Main-process extension point. Registration is code-owned; graph JSON cannot inject executors. */
export function registerCustomWorkflowNode(node: CustomWorkflowNode): void {
  if (!/^[a-z][a-z0-9_-]{0,119}$/.test(node.type)) throw new Error('Invalid custom node type')
  if (customNodes.has(node.type)) throw new Error(`Custom node already registered: ${node.type}`)
  customNodes.set(node.type, node)
}
export function getCustomWorkflowNode(type: string): CustomWorkflowNode | undefined { return customNodes.get(type) }
export function listCustomWorkflowNodeTypes(): string[] { return [...customNodes.keys()] }
