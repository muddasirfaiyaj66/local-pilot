import { describe, expect, it } from 'vitest'
import { parseGroundingCoordinates } from './grounding'

describe('parseGroundingCoordinates', () => {
  it('parses click(x, y)', () => {
    expect(parseGroundingCoordinates('click(120, 40)')).toEqual({ x: 120, y: 40 })
  })

  it('parses JSON coords', () => {
    expect(parseGroundingCoordinates('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 })
  })

  it('returns null when missing', () => {
    expect(parseGroundingCoordinates('no coords here')).toBeNull()
  })
})
