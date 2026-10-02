import { describe, expect, it } from 'vitest'
import { parseGroundingCoordinates } from './grounding'
import { scaleToPhysical } from './screen'

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

describe('scaleToPhysical', () => {
  it('maps screenshot coordinates onto the physical display', () => {
    expect(scaleToPhysical(50, 25, 100, 50, 2, 100, 50)).toEqual({ x: 100, y: 50 })
  })

  it('scales DIP coordinates by the display factor', () => {
    expect(scaleToPhysical(10, 10, 100, 50, 2)).toEqual({ x: 20, y: 20 })
  })

  it('keeps coordinates that are already past the DIP size', () => {
    expect(scaleToPhysical(300, 200, 100, 50, 2)).toEqual({ x: 300, y: 200 })
  })
})
