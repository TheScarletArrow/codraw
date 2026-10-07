import { describe, expect, it } from 'vitest'
import { normalizeRotation, rotatedBounds, rotationOf } from './rotation.ts'

describe('rotation', () => {
  it('is a whole angle from 0 to 359', () => {
    expect(normalizeRotation(45)).toBe(45)
    expect(normalizeRotation(360)).toBe(0)
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(725)).toBe(5)
    expect(normalizeRotation(12.4)).toBe(12)
    expect(normalizeRotation(359.6)).toBe(0)
    expect(normalizeRotation(-0.2)).toBe(0)
  })

  it('is no angle without a number', () => {
    expect(normalizeRotation(Number.NaN)).toBeNull()
    expect(normalizeRotation(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('is read from the key of draw.io, as stored or as a file has it', () => {
    expect(rotationOf({ rotation: 45 })).toBe(45)
    expect(rotationOf({ rotation: '30' })).toBe(30)
    expect(rotationOf({ rotation: -30 })).toBe(330)
    expect(rotationOf({ rotation: 12.5 })).toBe(12.5)
    expect(rotationOf({})).toBe(0)
    expect(rotationOf({ rotation: 'auto' })).toBe(0)
  })

  it('covers a turned box with a box around its centre', () => {
    const box = { x: 100, y: 100, width: 120, height: 60 }
    expect(rotatedBounds(box, 0)).toBe(box)
    expect(rotatedBounds(box, 360)).toBe(box)

    const quarter = rotatedBounds(box, 90)
    expect(quarter.x).toBeCloseTo(130)
    expect(quarter.y).toBeCloseTo(70)
    expect(quarter.width).toBeCloseTo(60)
    expect(quarter.height).toBeCloseTo(120)

    const half = Math.SQRT1_2 * 180
    const eighth = rotatedBounds(box, 45)
    expect(eighth.width).toBeCloseTo(half)
    expect(eighth.height).toBeCloseTo(half)
    expect(eighth.x + eighth.width / 2).toBeCloseTo(160)
    expect(eighth.y + eighth.height / 2).toBeCloseTo(130)
    expect(rotatedBounds(box, -45)).toEqual(eighth)
  })
})
