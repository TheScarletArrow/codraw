import { describe, expect, it } from 'vitest'
import {
  addLaserPoint,
  encodeLaser,
  LASER_FADE_MS,
  laserOpacity,
  MAX_LASER_POINTS,
  placeLaser,
  readLaser,
  trimLaser,
  type LaserTrail,
} from './laser.ts'

describe('laser trail', () => {
  it('goes on with the last stroke and starts a new one after the button was released', () => {
    let trail: LaserTrail = []
    trail = addLaserPoint(trail, { x: 1, y: 1 }, 0, true)
    trail = addLaserPoint(trail, { x: 2, y: 2 }, 10, false)
    trail = addLaserPoint(trail, { x: 9, y: 9 }, 20, true)

    expect(trail).toEqual([
      [
        { x: 1, y: 1, time: 0 },
        { x: 2, y: 2, time: 10 },
      ],
      [{ x: 9, y: 9, time: 20 }],
    ])
  })

  it('keeps the points of the last second only, and no stroke that has faded', () => {
    const trail: LaserTrail = [
      [{ x: 1, y: 1, time: 0 }],
      [
        { x: 2, y: 2, time: 500 },
        { x: 3, y: 3, time: 900 },
      ],
    ]

    expect(trimLaser(trail, 1_550)).toEqual([[{ x: 3, y: 3, time: 900 }]])
    expect(trimLaser(trail, 900 + LASER_FADE_MS)).toEqual([])
  })

  it('keeps the newest points of a trail that has more than allowed', () => {
    let trail: LaserTrail = []
    for (let index = 0; index < MAX_LASER_POINTS + 10; index++) {
      trail = addLaserPoint(trail, { x: index, y: 0 }, index, index === 30)
    }

    const points = trail.flat()
    expect(points).toHaveLength(MAX_LASER_POINTS)
    expect(points[0]!.x).toBe(10)
    expect(points.at(-1)!.x).toBe(MAX_LASER_POINTS + 9)
    expect(trail.map((stroke) => stroke.length)).toEqual([20, 40])
  })

  it('publishes rounded points with their ages, which place them on the clock of the one who receives them', () => {
    const trail: LaserTrail = [
      [
        { x: 10.4, y: 20.6, time: 1_000 },
        { x: 11, y: 21, time: 1_250.4 },
      ],
    ]

    const published = encodeLaser(trail, 1_300, 1_700_000_000_000)

    expect(published).toEqual({
      strokes: [
        [
          [10, 21, 300],
          [11, 21, 50],
        ],
      ],
      at: 1_700_000_000_000,
    })
    // The clock of the author does not matter: only the ages do.
    expect(placeLaser(published, 5_000)).toEqual([
      [
        { x: 10, y: 21, time: 4_700 },
        { x: 11, y: 21, time: 4_950 },
      ],
    ])
  })

  it('reads a trail of another participant within the bounds and ignores what is not a trail', () => {
    expect(readLaser({ strokes: [[[1, 2, 30]]], at: 5 })).toEqual({ strokes: [[[1, 2, 30]]], at: 5 })
    expect(readLaser(null)).toBeNull()
    expect(readLaser('trail')).toBeNull()
    expect(readLaser({ strokes: [[[1, 2, 30]]] })).toBeNull()
    expect(readLaser({ strokes: 'points', at: 5 })).toBeNull()
    // Points that are not, or had faded when they were sent, are dropped, and a trail without points is none.
    expect(
      readLaser({
        strokes: [
          [
            [1, 2, 30],
            [1, 'a', 3],
            [1, 2],
            [1, 2, -1],
            [1, 2, LASER_FADE_MS],
          ],
          'x',
          [],
        ],
        at: 5,
      }),
    ).toEqual({ strokes: [[[1, 2, 30]]], at: 5 })
    expect(readLaser({ strokes: [[[1, 2, LASER_FADE_MS]]], at: 5 })).toBeNull()

    const many = Array.from({ length: MAX_LASER_POINTS + 5 }, (_, index) => [index, 0, 0])
    const read = readLaser({ strokes: [many], at: 5 })!
    expect(read.strokes[0]).toHaveLength(MAX_LASER_POINTS)
    expect(read.strokes[0]![0]).toEqual([5, 0, 0])
  })

  it('fades a point out over a second', () => {
    const point = { x: 0, y: 0, time: 1_000 }

    expect(laserOpacity(point, 900)).toBe(1)
    expect(laserOpacity(point, 1_000)).toBe(1)
    expect(laserOpacity(point, 1_250)).toBe(0.75)
    expect(laserOpacity(point, 1_000 + LASER_FADE_MS)).toBe(0)
    expect(laserOpacity(point, 5_000)).toBe(0)
  })
})
