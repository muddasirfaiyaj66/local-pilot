import { describe, expect, it } from 'vitest'
import { parseToolArguments, createToolCallId } from './base'
import { joinUrl, redactSecrets } from './openaiCompat'

describe('parseToolArguments', () => {
  it('parses valid JSON objects', () => {
    expect(parseToolArguments('{"path":"/tmp"}')).toEqual({ path: '/tmp' })
  })

  it('repairs surrounding prose', () => {
    expect(parseToolArguments('Sure! {"x":1} done')).toEqual({ x: 1 })
  })

  it('returns raw fallback on garbage', () => {
    expect(parseToolArguments('not-json')).toEqual({ _raw: 'not-json' })
  })
})

describe('createToolCallId', () => {
  it('returns unique-ish ids', () => {
    const a = createToolCallId()
    const b = createToolCallId()
    expect(a).not.toEqual(b)
    expect(a.startsWith('call_')).toBe(true)
  })
})

describe('joinUrl / redactSecrets', () => {
  it('joins base and path without double slashes', () => {
    expect(joinUrl('http://localhost:11434/', '/api/chat')).toBe(
      'http://localhost:11434/api/chat'
    )
  })

  it('redacts api keys', () => {
    expect(redactSecrets('Bearer sk-abcdefghijklmnop')).toContain('***')
    expect(redactSecrets('Bearer sk-abcdefghijklmnop')).not.toContain('sk-abcdef')
  })
})
