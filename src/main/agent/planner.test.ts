import { describe, expect, it } from 'vitest'
import { buildPlan, formatPlanSummary, isCreateBuildGoal } from './planner'

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
})
