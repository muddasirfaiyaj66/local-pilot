import { describe, expect, it } from 'vitest'
import { isDeniedCommand } from './shell'

describe('isDeniedCommand', () => {
  it('blocks destructive patterns', () => {
    expect(isDeniedCommand('rm -rf /')).toBe(true)
    expect(isDeniedCommand('shutdown now')).toBe(true)
  })

  it('allows normal commands', () => {
    expect(isDeniedCommand('npm test')).toBe(false)
    expect(isDeniedCommand('git status')).toBe(false)
  })
})
