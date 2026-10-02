import { describe, expect, it } from 'vitest'
import { contextLimitForModel } from './context'

describe('contextLimitForModel', () => {
  it('uses a smaller window for unknown and older local models', () => {
    expect(contextLimitForModel('llama3')).toBe(8_192)
    expect(contextLimitForModel('some-custom-model')).toBe(32_768)
  })

  it('keeps large windows for the models LocalPilot ships with', () => {
    expect(contextLimitForModel('gemma4:31b-cloud')).toBe(128_000)
    expect(contextLimitForModel('claude-sonnet')).toBe(200_000)
    expect(contextLimitForModel('gpt-4o-mini')).toBe(128_000)
  })
})
