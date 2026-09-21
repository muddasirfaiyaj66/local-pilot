import { describe, expect, it } from 'vitest'
import { buildPlan, formatPlanSummary, isCreateBuildGoal } from './planner'

describe('planner', () => {
  it('detects create/build goals', () => {
    expect(isCreateBuildGoal('create a todo application')).toBe(true)
    expect(isCreateBuildGoal('Build a React app')).toBe(true)
    expect(isCreateBuildGoal('fix failing tests')).toBe(false)
  })

  it('scaffolds create-oriented steps', () => {
    const plan = buildPlan('create a todo application')
    expect(plan.steps.some((s) => /scaffold/i.test(s.title))).toBe(true)
    expect(formatPlanSummary(plan)).toMatch(/Switch to Agent mode/)
  })
})
