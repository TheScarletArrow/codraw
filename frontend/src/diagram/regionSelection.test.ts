import { describe, expect, it } from 'vitest'
import { touchedByRegion } from './regionSelection.ts'

const region = { x: 100, y: 100, width: 200, height: 100 }

describe('touchedByRegion', () => {
  it('takes a shape that the region touches, even partly', () => {
    expect(touchedByRegion(region, { kind: 'shape', box: { x: 150, y: 120, width: 50, height: 50 } })).toBe(true)
    expect(touchedByRegion(region, { kind: 'shape', box: { x: 280, y: 180, width: 100, height: 100 } })).toBe(true)
    expect(touchedByRegion(region, { kind: 'shape', box: { x: 0, y: 0, width: 500, height: 500 } })).toBe(true)
  })

  it('leaves a shape outside the region', () => {
    expect(touchedByRegion(region, { kind: 'shape', box: { x: 310, y: 120, width: 50, height: 50 } })).toBe(false)
    expect(touchedByRegion(region, { kind: 'shape', box: { x: 150, y: 0, width: 50, height: 90 } })).toBe(false)
  })

  it('takes a frame only when it is wholly inside the region', () => {
    expect(touchedByRegion(region, { kind: 'frame', box: { x: 120, y: 110, width: 100, height: 60 } })).toBe(true)
    expect(touchedByRegion(region, { kind: 'frame', box: { x: 0, y: 0, width: 500, height: 500 } })).toBe(false)
    expect(touchedByRegion(region, { kind: 'frame', box: { x: 250, y: 150, width: 100, height: 100 } })).toBe(false)
  })

  it('takes an edge whose line crosses the region', () => {
    const crossing = [
      { x: 50, y: 150 },
      { x: 350, y: 150 },
    ]
    const diagonal = [
      { x: 50, y: 50 },
      { x: 350, y: 250 },
    ]

    expect(touchedByRegion(region, { kind: 'edge', box: { x: 50, y: 150, width: 300, height: 0 }, points: crossing })).toBe(true)
    expect(touchedByRegion(region, { kind: 'edge', box: { x: 50, y: 50, width: 300, height: 200 }, points: diagonal })).toBe(true)
  })

  it('takes an edge with a point inside the region', () => {
    const inside = [
      { x: 150, y: 150 },
      { x: 150, y: 400 },
    ]

    expect(touchedByRegion(region, { kind: 'edge', box: { x: 150, y: 150, width: 0, height: 250 }, points: inside })).toBe(true)
  })

  it('leaves an edge that only goes around the region', () => {
    // An L-shaped edge whose bounds cover the region but whose line does not touch it.
    const around = [
      { x: 50, y: 50 },
      { x: 350, y: 50 },
      { x: 350, y: 300 },
    ]

    expect(touchedByRegion(region, { kind: 'edge', box: { x: 50, y: 50, width: 300, height: 250 }, points: around })).toBe(false)
  })
})
