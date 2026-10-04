import { describe, expect, it } from 'vitest'
import { blocksPlacement, placeConnected, QUICK_CONNECT_GAP } from './quickConnect.ts'
import { findShape } from './shapes.ts'

const source = { x: 100, y: 100, width: 120, height: 60 }
const size = { width: 120, height: 60 }

describe('placeConnected', () => {
  it('puts the new shape at the gap on the side, centred on the axis of the source', () => {
    expect(QUICK_CONNECT_GAP).toBe(80)
    expect(placeConnected(source, size, 'right', [])).toEqual({ x: 300, y: 100 })
    expect(placeConnected(source, size, 'left', [])).toEqual({ x: -100, y: 100 })
    expect(placeConnected(source, size, 'bottom', [])).toEqual({ x: 100, y: 240 })
    expect(placeConnected(source, size, 'top', [])).toEqual({ x: 100, y: -40 })
  })

  it('keeps the new shape exactly on the axis, so that the edge is straight, and snaps the distance to the grid', () => {
    expect(placeConnected(source, { width: 100, height: 90 }, 'right', [])).toEqual({ x: 300, y: 85 })
    expect(placeConnected(source, { width: 90, height: 70 }, 'bottom', [])).toEqual({ x: 115, y: 240 })
    expect(placeConnected({ ...source, height: 56 }, size, 'left', [])).toEqual({ x: -100, y: 98 })
    expect(placeConnected({ ...source, y: 95 }, size, 'bottom', [])).toEqual({ x: 100, y: 240 })
  })

  it('shifts the new shape along the side past the shapes in the way', () => {
    const taken = { x: 300, y: 100, width: 120, height: 60 }
    const below = { x: 300, y: 180, width: 120, height: 60 }

    expect(placeConnected(source, size, 'right', [taken])).toEqual({ x: 300, y: 180 })
    expect(placeConnected(source, size, 'right', [taken, below])).toEqual({ x: 300, y: 260 })
    expect(placeConnected(source, size, 'bottom', [{ x: 100, y: 240, width: 120, height: 60 }])).toEqual({
      x: 240,
      y: 240,
    })
  })

  it('keeps steps on the grid for shapes of other sizes', () => {
    const table = { width: 180, height: 56 }
    const taken = { x: 300, y: 100, width: 180, height: 56 }

    expect(placeConnected(source, table, 'right', [taken])).toEqual({ x: 300, y: 182 })
  })

  it('does not count a frame around the source as a shape in the way', () => {
    const boundary = findShape('boundary')!
    const shapes = [
      { box: { x: 0, y: 0, width: 600, height: 400 }, style: boundary.style },
      { box: { x: 300, y: 100, width: 120, height: 60 }, style: findShape('service')!.style },
    ]
    const obstacles = shapes.filter((shape) => blocksPlacement(shape.style)).map((shape) => shape.box)

    expect(blocksPlacement(findShape('kubernetes-cluster')!.style)).toBe(false)
    expect(blocksPlacement(findShape('c4-boundary')!.style)).toBe(false)
    expect(placeConnected(source, size, 'right', obstacles)).toEqual({ x: 300, y: 180 })
  })
})
