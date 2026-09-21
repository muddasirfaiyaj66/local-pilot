import { randomUUID } from 'node:crypto'
import type { AgentPlan } from '@shared/agent'

/** Short editable plan from a natural-language goal (heuristic; LLM can refine later). */
export function buildPlan(goal: string): AgentPlan {
  const g = goal.trim()
  const lower = g.toLowerCase()
  const steps: AgentPlan['steps'] = []

  steps.push({ id: randomUUID(), title: 'Understand goal & workspace', status: 'pending' })

  if (/\b(image|video|audio|ffmpeg|resize|crop|media)\b/.test(lower)) {
    steps.push({ id: randomUUID(), title: 'Locate media files', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Transform with media tools', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Verify output', status: 'pending' })
  } else if (/\b(remember|memory|note|recall)\b/.test(lower)) {
    steps.push({ id: randomUUID(), title: 'Search or update memory', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Confirm stored facts', status: 'pending' })
  } else if (/\b(test|tests|vitest|jest|pytest)\b/.test(lower)) {
    steps.push({ id: randomUUID(), title: 'Inspect failing tests / code', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Apply fix', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Run tests', status: 'pending' })
  } else if (isCreateBuildGoal(lower)) {
    steps.push({ id: randomUUID(), title: 'Confirm workspace (empty OK for greenfield)', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Scaffold project files', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Implement core features', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Verify app runs / looks right', status: 'pending' })
  } else if (/\b(file|read|write|edit|refactor)\b/.test(lower)) {
    steps.push({ id: randomUUID(), title: 'Locate relevant files', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Apply file changes', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Verify result', status: 'pending' })
  } else if (/\b(git|commit|diff|status)\b/.test(lower)) {
    steps.push({ id: randomUUID(), title: 'Inspect git state', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Perform git action', status: 'pending' })
  } else if (/\b(shell|command|run|npm|install)\b/.test(lower)) {
    steps.push({ id: randomUUID(), title: 'Prepare command', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Execute shell (with approval if risky)', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Check output', status: 'pending' })
  } else {
    steps.push({ id: randomUUID(), title: 'Gather context with tools', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Take actions toward the goal', status: 'pending' })
    steps.push({ id: randomUUID(), title: 'Confirm completion', status: 'pending' })
  }

  return { goal: g, steps, editable: true }
}

/** Goals that create new apps/files from scratch (Plan should not loop on empty dirs). */
export function isCreateBuildGoal(goal: string): boolean {
  const lower = goal.toLowerCase()
  return /\b(create|build|scaffold|make|implement|generate|write|bootstrap|set\s*up)\b/.test(
    lower
  )
}

/** Human-readable plan text for Plan-mode completion. */
export function formatPlanSummary(plan: AgentPlan): string {
  const lines = plan.steps.map((s, i) => `${i + 1}. ${s.title}`)
  return `Plan for: ${plan.goal}\n\n${lines.join('\n')}\n\nSwitch to Agent mode to execute these steps (Plan mode is read-only).`
}
