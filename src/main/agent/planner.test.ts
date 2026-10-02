import { describe, expect, it } from 'vitest'
import { mergeEditedPlanTitles } from '@shared/agent'
import { buildPlan, formatPlanSummary, isCreateBuildGoal, withPlanProgress } from './planner'

describe('planner', () => {
  it('detects create/build goals', () => {
    expect(isCreateBuildGoal('create a todo application')).toBe(true)
    expect(isCreateBuildGoal('Build a React app')).toBe(true)
    expect(isCreateBuildGoal('scaffold a vite project')).toBe(true)
    expect(isCreateBuildGoal('bootstrap a new website')).toBe(true)
    expect(isCreateBuildGoal('new project for notes')).toBe(true)
    expect(isCreateBuildGoal('fix failing tests')).toBe(false)
    expect(isCreateBuildGoal('make the button blue')).toBe(false)
    expect(isCreateBuildGoal('write a test for the parser')).toBe(false)
    expect(isCreateBuildGoal('implement the login form')).toBe(false)
  })

  it('scaffolds create-oriented steps', () => {
    const plan = buildPlan('create a todo application')
    expect(plan.steps.some((s) => /scaffold/i.test(s.title))).toBe(true)
    expect(formatPlanSummary(plan)).toMatch(/Switch to Agent mode/)
  })

  it('advances step status through a run', () => {
    const plan = buildPlan('fix the parser')
    const started = withPlanProgress(plan, 'start')
    expect(started.steps[0]?.status).toBe('active')
    const acting = withPlanProgress(started, 'act')
    expect(acting.steps[0]?.status).toBe('done')
    expect(acting.steps[1]?.status).toBe('active')
    const verifying = withPlanProgress(acting, 'verify')
    expect(verifying.steps.at(-1)?.status).toBe('active')
    expect(withPlanProgress(verifying, 'done').steps.every((step) => step.status === 'done')).toBe(true)
    expect(withPlanProgress(started, 'fail').steps[0]?.status).toBe('failed')
  })

  it('keeps a renamed step when progress updates the same ids', () => {
    const plan = withPlanProgress(buildPlan('fix the parser'), 'act')
    const renamed = plan.steps[1]
    expect(renamed).toBeTruthy()
    const merged = mergeEditedPlanTitles(plan, { [renamed!.id]: 'Rename the parser module' })
    expect(merged.steps[1]?.title).toBe('Rename the parser module')
    expect(merged.steps[1]?.status).toBe(renamed!.status)
    expect(merged.steps[0]?.title).toBe(plan.steps[0]?.title)
  })
})
