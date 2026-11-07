import { describe, expect, it } from 'vitest'
import { extractCode, languageForPath } from './codeUtils'

describe('extractCode', () => {
  it('returns the first fenced block', () => {
    expect(extractCode('Here you go:\n```ts\nconst a = 1\n```\nDone')).toBe('const a = 1')
  })

  it('handles an unterminated fence while streaming', () => {
    expect(extractCode('```python\ndef f():\n    pass')).toBe('def f():\n    pass')
  })

  it('falls back to the trimmed reply without a fence', () => {
    expect(extractCode('  x = 2\n')).toBe('x = 2')
  })

  it('keeps inner indentation and CRLF bodies', () => {
    expect(extractCode('```\r\n  a\r\n    b\r\n```')).toBe('  a\r\n    b')
  })
})

describe('languageForPath', () => {
  it('maps common extensions and special names', () => {
    expect(languageForPath('src/App.tsx')).toBe('typescript')
    expect(languageForPath('main.py')).toBe('python')
    expect(languageForPath('docker/Dockerfile')).toBe('dockerfile')
    expect(languageForPath('README')).toBe('plaintext')
    expect(languageForPath('x.unknownext')).toBe('plaintext')
  })
})
