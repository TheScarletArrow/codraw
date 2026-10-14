import type { LineDash, Point } from './editor.ts'
import { styleValues, type AnyStyle } from './styleValues.ts'

/**
 * Style key of a line drawn by hand with the pencil: an edge of draw.io without ends, curved through its points.
 * draw.io keeps keys it does not know, so a line that went through draw.io comes back as one.
 */
export const FREEHAND_KEY = 'codrawFreehand'

/** The style is that of a line drawn by hand; see {@link FREEHAND_KEY}. */
export function isFreehandStyle(style: AnyStyle | null | undefined): boolean {
  const value = style ? styleValues(style)[FREEHAND_KEY] : undefined
  return value === true || value === 1 || value === '1'
}

/** How far a simplified line may leave the drawn one, in pixels of the screen. */
export const SIMPLIFY_TOLERANCE = 1.5

/** The most points a line drawn by hand keeps; a longer one is simplified more. */
export const MAX_STROKE_POINTS = 500

/** A stroke whose points all lie this close to its first one, in pixels of the screen, is a click, not a line. */
export const MIN_STROKE_EXTENT = 2

/** Above this scale the points of a line keep tenths, so that it stays as precise as it was drawn. */
const FINE_SCALE = 2

/** Distance from `p` to the segment from `a` to `b`. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Douglas–Peucker: the points of a polyline without those that lie within `tolerance` of the line through the points
 * kept around them; the ends are always kept. Distances are to segments, so a closed loop, whose ends meet, keeps its
 * shape too.
 */
export function simplifyPath(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points]
  const kept = new Uint8Array(points.length)
  kept[0] = 1
  kept[points.length - 1] = 1
  const spans: [number, number][] = [[0, points.length - 1]]
  while (spans.length > 0) {
    const [first, last] = spans.pop()!
    let farthest = -1
    let distance = tolerance
    for (let index = first + 1; index < last; index++) {
      const next = segmentDistance(points[index]!, points[first]!, points[last]!)
      if (next > distance) {
        distance = next
        farthest = index
      }
    }
    if (farthest < 0) continue
    kept[farthest] = 1
    spans.push([first, farthest], [farthest, last])
  }
  return points.filter((_, index) => kept[index] === 1)
}

/** The points simplified with `tolerance`, rounded, without repeats that rounding made. */
function simplified(points: readonly Point[], tolerance: number, round: (value: number) => number): Point[] {
  const result: Point[] = []
  for (const point of simplifyPath(points, tolerance)) {
    const rounded = { x: round(point.x), y: round(point.y) }
    const previous = result.at(-1)
    if (!previous || previous.x !== rounded.x || previous.y !== rounded.y) result.push(rounded)
  }
  return result
}

/**
 * The points of a line drawn through `drawn` (diagram coordinates) at `scale`: simplified within
 * {@link SIMPLIFY_TOLERANCE} pixels of the screen, rounded to whole units of the diagram, or to tenths above 200%, at
 * most {@link MAX_STROKE_POINTS} of them. `null` for a click: no point is further than {@link MIN_STROKE_EXTENT} pixels
 * of the screen from the first one.
 */
export function strokePoints(drawn: readonly Point[], scale: number): Point[] | null {
  const first = drawn[0]
  if (!first || drawn.every((point) => Math.hypot(point.x - first.x, point.y - first.y) <= MIN_STROKE_EXTENT / scale)) {
    return null
  }
  const round = scale > FINE_SCALE ? (value: number) => Math.round(value * 10) / 10 : Math.round
  let tolerance = SIMPLIFY_TOLERANCE / scale
  let points = simplified(drawn, tolerance, round)
  while (points.length > MAX_STROKE_POINTS) {
    tolerance *= 2
    points = simplified(drawn, tolerance, round)
  }
  return points.length >= 2 ? points : null
}

/**
 * How close the eraser takes a line drawn by hand, in pixels of the screen from the edge of the line: the radius of the
 * pointer of the eraser.
 */
export const ERASER_RADIUS = 8

/** Segments of the polyline that a quadratic segment of a curve becomes: far within a pixel for lines drawn by hand. */
const CURVE_STEPS = 8

/**
 * The polyline that the curve through `points` is drawn as. maxGraph (`PolylineShape.paintCurvedLine`) and draw.io curve
 * from the first point to the middle between the second and the third with its vertex at the second, then on to the
 * next middle, and end at the last point with its vertex at the one before; each of these quadratic segments becomes
 * {@link CURVE_STEPS} segments. The curve cuts the corners of the polyline through `points`.
 */
export function curvePath(points: readonly Point[]): Point[] {
  if (points.length <= 2) return [...points]
  let start = points[0]!
  const path = [start]
  const curveTo = (vertex: Point, end: Point) => {
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS
      const u = 1 - t
      path.push({
        x: u * u * start.x + 2 * u * t * vertex.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * vertex.y + t * t * end.y,
      })
    }
    start = end
  }
  for (let index = 1; index < points.length - 2; index++) {
    const vertex = points[index]!
    const next = points[index + 1]!
    curveTo(vertex, { x: (vertex.x + next.x) / 2, y: (vertex.y + next.y) / 2 })
  }
  curveTo(points.at(-2)!, points.at(-1)!)
  return path
}

/** The polyline along which a line is drawn, and the box around it. */
export interface DrawnPath {
  points: Point[]
  left: number
  top: number
  right: number
  bottom: number
}

/** The path of a line through `points`: along its curve (see {@link curvePath}) when it is `curved`. */
export function drawnPath(points: readonly Point[], curved: boolean): DrawnPath {
  const path = curved ? curvePath(points) : [...points]
  const xs = path.map(({ x }) => x)
  const ys = path.map(({ y }) => y)
  return { points: path, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

/** Which side of the line from `a` through `b` the point `p` lies on: the sign, 0 on the line. */
const side = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)

/** Distance between the segment from `a` to `b` and the one from `c` to `d`: 0 when they cross. */
function segmentsDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return 0
  return Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b))
}

/**
 * The eraser, moved from `from` to `to`, or pressed at `from` when they are the same, comes within `distance` of `path`.
 * The segment between the two points of the pointer covers a fast move, which skips over a line between its events.
 */
export function eraserTouches(path: DrawnPath, from: Point, to: Point, distance: number): boolean {
  if (
    Math.max(from.x, to.x) < path.left - distance ||
    Math.min(from.x, to.x) > path.right + distance ||
    Math.max(from.y, to.y) < path.top - distance ||
    Math.min(from.y, to.y) > path.bottom + distance
  ) {
    return false
  }
  const { points } = path
  if (points.length === 1) return segmentDistance(points[0]!, from, to) <= distance
  for (let index = 1; index < points.length; index++) {
    if (segmentsDistance(from, to, points[index - 1]!, points[index]!) <= distance) return true
  }
  return false
}

/** The line that the pencil draws with. */
export interface PencilLine {
  color: string
  /** Width of the line, from 1 to 20. */
  width: number
  dash: LineDash
}

/** The line of the pencil until the participant chooses one: the color of lines of CoDraw, a little thicker. */
export const DEFAULT_PENCIL_LINE: PencilLine = { color: '#1f2328', width: 2, dash: 'solid' }

let line: PencilLine = DEFAULT_PENCIL_LINE

/**
 * The line of the pencil, shared by the editors of all pages and boards of the browser tab, as the clipboard of the tab
 * is: a new editor is created for every page, but the color the participant chose stays.
 */
export const pencilLine = {
  get(): PencilLine {
    return line
  },
  /** Changes the line; returns whether it changed. */
  set(changes: Partial<PencilLine>): boolean {
    const next = { ...line, ...changes }
    if (next.color === line.color && next.width === line.width && next.dash === line.dash) return false
    line = next
    return true
  },
}
