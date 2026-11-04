type Filter = { filter?: { path: string; equals: unknown } }
export type WorkflowTriggerConfig = Filter & (
  | { id: string; workflowId: string; kind: 'schedule'; intervalMs: number; enabled: boolean; dedupeMs: number }
  | { id: string; workflowId: string; kind: 'filesystem'; path: string; recursive: boolean; events: Array<'rename' | 'change'>; enabled: boolean; dedupeMs: number }
  | { id: string; workflowId: string; kind: 'git'; path: string; intervalMs: number; enabled: boolean; dedupeMs: number }
  | { id: string; workflowId: string; kind: 'webhook'; path: string; port: number; enabled: boolean; dedupeMs: number }
)
