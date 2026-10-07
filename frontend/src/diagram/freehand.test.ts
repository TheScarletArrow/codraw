import { afterEach, describe, expect, it } from 'vitest'
import type { Point } from './editor.ts'
import {
  DEFAULT_PENCIL_LINE,
  isFreehandStyle,
  MAX_STROKE_POINTS,
  pencilLine,
  simplifyPath,
  strokePoints,
} from './freehand.ts'

/** `count` points evenly along the segment from `from` to `to`, both included. */
const along = (from: Point, to: Point, count: number): Point[] =>
  Array.from({ length: count }, (_, index) => ({
    x: from.x + ((to.x - from.x) * index) / (count - 1),
    y: from.y + ((to.y - from.y) * index) / (count - 1),
  }))

/** Points of a circle around (cx, cy), the first one again at the end. */
const circle = (cx: number, cy: number, radius: number, count: number): Point[] =>
  Array.from({ length: count + 1 }, (_, index) => ({
    x: cx + radius * Math.cos((2 * Math.PI * index) / count),
    y: cy + radius * Math.sin((2 * Math.PI * index) / count),
  }))

/** The largest distance from a point of `points` to the polyline through `line`. */
function deviation(points: Point[], line: Point[]): number {
  const toSegment = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = dx * dx + dy * dy
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  return Math.max(...points.map((p) => Math.min(...line.slice(1).map((b, index) => toSegment(p, line[index]!, b)))))
}

describe('simplifyPath', () => {
  it('keeps the ends of a straight line only', () => {
    expect(simplifyPath(along({ x: 0, y: 0 }, { x: 300, y: 150 }, 100), 1)).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 150 },
    ])
  })

  it('keeps the corner of an angle and drops the jitter within the tolerance', () => {
    const jittered = [
      ...along({ x: 0, y: 0 }, { x: 100, y: 0 }, 50).map((point, index) => ({ ...point, y: index % 2 ? 0.4 : -0.4 })),
      ...along({ x: 100, y: 0 }, { x: 100, y: 100 }, 50).slice(1),
    ]

    const simplified = simplifyPath(jittered, 1)

    expect(simplified).toHaveLength(3)
    expect(simplified[1]).toMatchObject({ x: 100 })
  })

  it('keeps a closed loop, whose ends meet, within the tolerance', () => {
    const loop = circle(100, 100, 50, 200)

    const simplified = simplifyPath(loop, 1)

    expect(simplified.length).toBeLessThan(40)
    expect(simplified.length).toBeGreaterThan(8)
    expect(deviation(loop, simplified)).toBeLessThanOrEqual(1)
  })

  it('leaves one or two points as they are', () => {
    expect(simplifyPath([{ x: 1, y: 2 }], 1)).toEqual([{ x: 1, y: 2 }])
    expect(simplifyPath([], 1)).toEqual([])
  })
})

describe('strokePoints', () => {
  it('simplifies within a pixel and a half of the screen and rounds to whole units', () => {
    const wavy = along({ x: 0, y: 0 }, { x: 200, y: 0 }, 201).map((point) => ({
      x: point.x + 0.3,
      y: 20 * Math.sin(point.x / 20) + 0.2,
    }))

    const points = strokePoints(wavy, 1)!

    expect(points.length).toBeLessThan(60)
    expect(points.every(({ x, y }) => Number.isInteger(x) && Number.isInteger(y))).toBe(true)
    expect(deviation(wavy, points)).toBeLessThanOrEqual(1.5 + Math.SQRT1_2)
  })

  it('keeps more points of the same line drawn at a larger scale, and tenths above 200%', () => {
    const drawn = along({ x: 0, y: 0 }, { x: 50, y: 0 }, 201).map((point) => ({ x: point.x + 0.04, y: 2 * Math.sin(point.x) }))

    const small = strokePoints(drawn, 0.5)!
    const large = strokePoints(drawn, 4)!

    expect(large.length).toBeGreaterThan(small.length)
    expect(large.some(({ x }) => !Number.isInteger(x))).toBe(true)
    const tenths = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9
    expect(large.every(({ x, y }) => tenths(x) && tenths(y))).toBe(true)
  })

  it('takes a press without a move, or one within two pixels of the screen, for a click', () => {
    expect(strokePoints([{ x: 10, y: 10 }], 1)).toBeNull()
    expect(strokePoints([{ x: 10, y: 10 }, { x: 11, y: 11 }, { x: 10, y: 12 }], 1)).toBeNull()
    expect(strokePoints([{ x: 10, y: 10 }, { x: 10.5, y: 10 }], 4)).toBeNull()
    expect(strokePoints([], 1)).toBeNull()
    expect(strokePoints([{ x: 10, y: 10 }, { x: 13, y: 10 }], 1)).toEqual([
      { x: 10, y: 10 },
      { x: 13, y: 10 },
    ])
  })

  it('keeps no more than 500 points of a long scribble', () => {
    const scribble = Array.from({ length: 20_000 }, (_, index) => ({
      x: (index % 200) * 5,
      y: Math.floor(index / 200) * 7 + (index % 2) * 6,
    }))

    const points = strokePoints(scribble, 1)!

    expect(points.length).toBeLessThanOrEqual(MAX_STROKE_POINTS)
    expect(points.length).toBeGreaterThan(MAX_STROKE_POINTS / 4)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual(scribble.at(-1))
  })
})

describe('isFreehandStyle', () => {
  it('tells a line drawn by hand by its key, as the board, draw.io and old clients may write it', () => {
    expect(isFreehandStyle({ codrawFreehand: true })).toBe(true)
    expect(isFreehandStyle({ codrawFreehand: 1 })).toBe(true)
    expect(isFreehandStyle({ codrawFreehand: '1' })).toBe(true)
    expect(isFreehandStyle({ codrawFreehand: false, curved: true })).toBe(false)
    expect(isFreehandStyle({})).toBe(false)
    expect(isFreehandStyle(null)).toBe(false)
  })
})

describe('pencilLine', () => {
  afterEach(() => {
    pencilLine.set(DEFAULT_PENCIL_LINE)
  })

  it('starts black, two wide and solid, and tells whether a change changed it', () => {
    expect(pencilLine.get()).toEqual({ color: '#1f2328', width: 2, dash: 'solid' })

    expect(pencilLine.set({ color: '#b85450' })).toBe(true)
    expect(pencilLine.set({ color: '#b85450', dash: 'solid' })).toBe(false)

    expect(pencilLine.get()).toEqual({ color: '#b85450', width: 2, dash: 'solid' })
  })
})
