import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '@shared/workflow'

/** A reviewable project-change workflow. IDs are stable within one new copy. */
export function createProjectAssistantTemplate(): WorkflowDefinition {
  const now = Date.now()
  const prefix = crypto.randomUUID()
  const node = (name: string): string => `${prefix}-${name}`
  const nodes: WorkflowNode[] = [
    { id: node('input'), label: 'Task input', kind: 'input', config: {}, position: { x: 40, y: 220 } },
    { id: node('plan'), label: 'Planner', kind: 'agent', config: { mode: 'plan', route: 'strong', goal: 'Plan the requested project change. Use the request and constraints in workflow data. Identify affected files, risks, and exact verification commands. Do not edit files. Return a concise actionable plan.' }, position: { x: 260, y: 220 } },
    { id: node('approve-plan'), label: 'Approve plan', kind: 'approval', config: { prompt: 'Review the Planner output in the run inspector. Approve this project change before the Executor edits files.' }, position: { x: 480, y: 220 } },
    { id: node('execute'), label: 'Executor', kind: 'agent', config: { mode: 'agent', route: 'strong', goal: 'Implement the approved plan from workflow data. Make the smallest necessary changes. Preserve existing behavior and report changed files and checks performed.' }, position: { x: 700, y: 220 } },
    { id: node('verify'), label: 'Verifier', kind: 'agent', config: { mode: 'agent', route: 'strong', goal: 'Independently verify the Executor result. Inspect the changes and run relevant checks from the plan where possible. If every relevant check passes, end your final summary with the exact marker CHECKS_PASSED. If anything fails, is unverified, or cannot be run, do not include that marker. Report concrete evidence and failures.' }, position: { x: 920, y: 220 } },
    { id: node('passed'), label: 'Checks passed?', kind: 'condition', config: { path: `${node('verify')}.summary`, operator: 'contains', value: 'CHECKS_PASSED' }, position: { x: 1140, y: 220 } },
    { id: node('success'), label: 'Verified result', kind: 'output', config: {}, position: { x: 1360, y: 80 } },
    { id: node('approve-repair'), label: 'Approve repair', kind: 'approval', config: { prompt: 'Verification did not pass. Review the Verifier output and approve one focused repair attempt.' }, position: { x: 1360, y: 360 } },
    { id: node('repair'), label: 'Repair', kind: 'agent', config: { mode: 'agent', route: 'strong', goal: 'Use the Verifier findings in workflow data to fix only the reported failures. Do not expand scope. Report the exact changes and checks.' }, position: { x: 1580, y: 360 } },
    { id: node('final-verify'), label: 'Final verifier', kind: 'agent', config: { mode: 'agent', route: 'strong', goal: 'Independently verify the repair. Run the relevant checks and report each result, remaining failures, and any checks that could not run. Never claim a check passed without running it.' }, position: { x: 1800, y: 360 } },
    { id: node('final-result'), label: 'Repair result', kind: 'output', config: {}, position: { x: 2020, y: 360 } }
  ]
  const edge = (source: string, target: string, branch?: 'true' | 'false'): WorkflowEdge => ({ id: crypto.randomUUID(), source: node(source), target: node(target), ...(branch ? { branch } : {}) })
  const edges = [
    edge('input', 'plan'), edge('plan', 'approve-plan'),
    edge('plan', 'execute'), edge('approve-plan', 'execute'),
    edge('execute', 'verify'), edge('verify', 'passed'),
    edge('passed', 'success', 'true'), edge('verify', 'success'),
    edge('passed', 'approve-repair', 'false'),
    edge('approve-repair', 'repair'), edge('verify', 'repair'),
    edge('repair', 'final-verify'), edge('final-verify', 'final-result')
  ]
  return { id: crypto.randomUUID(), name: 'Project change assistant', version: 1, nodes, edges, createdAt: now, updatedAt: now }
}
