import { describe, expect, it } from 'vitest'
import { diffHunks, keepHunk, undoHunk } from './diff'

describe('diffHunks', () => {
  it('returns one hunk for a single-line edit', () => {
    const hunks = diffHunks('alpha\nbeta\ngamma', 'alpha\nBETA\ngamma')
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      beforeLines: ['beta'],
      afterLines: ['BETA']
    })
  })

  it('undo restores the old lines and keep accepts them', () => {
    const before = 'alpha\nbeta\ngamma'
    const after = 'alpha\nBETA\ngamma'
    const hunk = diffHunks(before, after)[0]!
    expect(undoHunk(after, hunk)).toBe(before)
    expect(keepHunk(before, hunk)).toBe(after)
  })

  it('treats an empty before as a new file', () => {
    const hunks = diffHunks('', 'hello')
    expect(hunks).toEqual([
      { beforeStart: 0, beforeLines: [], afterStart: 0, afterLines: ['hello'] }
    ])
    expect(undoHunk('hello', hunks[0]!)).toBe('')
  })
})
