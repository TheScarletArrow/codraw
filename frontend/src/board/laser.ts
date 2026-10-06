import type { Point } from '../diagram/editor.ts'

/** How long a point of a trail of the laser pointer is seen: it fades out over this time after it was drawn. */
export const LASER_FADE_MS = 1000

/**
 * The most points of a trail that are kept and published, the newest ones: a second of a pointer that moves 60 times
 * per second.
 */
export const MAX_LASER_POINTS = 60

/** A point of a trail in diagram coordinates and when it was drawn, on the clock of the client that shows it (ms). */
export interface LaserPoint extends Point {
  time: number
}

/**
 * A trail of the laser pointer: its strokes, each from pressing the button to releasing it, oldest first, with their
 * points in the order they were drawn.
 */
export type LaserTrail = LaserPoint[][]

/** A trail as a participant publishes it to the others; see {@link encodeLaser}. */
export interface PublishedLaser {
  /** Strokes of points `[x, y, age]`: rounded diagram coordinates and how long before `at` the point was drawn (ms). */
  strokes: [number, number, number][][]
  /** When the trail was published, on the clock of its author (ms): tells a new trail from the same one sent again. */
  at: number
}

/** The trail with `point` drawn at `time`, starting a new stroke or going on with the last one, and then trimmed. */
export function addLaserPoint(trail: LaserTrail, point: Point, time: number, newStroke: boolean): LaserTrail {
  const next: LaserPoint = { x: point.x, y: point.y, time }
  const last = trail.at(-1)
  return trimLaser(newStroke || !last ? [...trail, [next]] : [...trail.slice(0, -1), [...last, next]], time)
}

/** The points of the trail still seen at `now`, at most {@link MAX_LASER_POINTS} newest ones, without empty strokes. */
export function trimLaser(trail: LaserTrail, now: number): LaserTrail {
  return keepNewest(trail.map((stroke) => stroke.filter((point) => now - point.time < LASER_FADE_MS)))
}

/** The trail as it is published at `now`: ages instead of times, so that the clocks of the others do not matter. */
export function encodeLaser(trail: LaserTrail, now: number, at = Date.now()): PublishedLaser {
  return {
    strokes: trail.map((stroke) =>
      stroke.map(({ x, y, time }): [number, number, number] => [
        Math.round(x),
        Math.round(y),
        Math.max(0, Math.round(now - time)),
      ]),
    ),
    at,
  }
}

/**
 * The trail another participant published, or `null` for anything that is not one. Points that are not, that had faded
 * already, and those beyond the {@link MAX_LASER_POINTS} newest are dropped: another client may send anything.
 */
export function readLaser(value: unknown): PublishedLaser | null {
  if (typeof value !== 'object' || value === null) return null
  const { strokes, at } = value as Record<string, unknown>
  if (!Number.isFinite(at) || !Array.isArray(strokes)) return null
  const kept = keepNewest(
    strokes.map((stroke: unknown) => (Array.isArray(stroke) ? stroke.filter(isPublishedPoint) : [])),
  )
  return kept.length > 0 ? { strokes: kept, at: at as number } : null
}

const isPublishedPoint = (point: unknown): point is [number, number, number] =>
  Array.isArray(point) &&
  point.length === 3 &&
  point.every(Number.isFinite) &&
  (point[2] as number) >= 0 &&
  (point[2] as number) < LASER_FADE_MS

/** A published trail on the local clock: each point was drawn its age before `receivedAt`, when the trail arrived. */
export function placeLaser(laser: PublishedLaser, receivedAt: number): LaserTrail {
  return laser.strokes.map((stroke) => stroke.map(([x, y, age]) => ({ x, y, time: receivedAt - age })))
}

/** How much of a point is seen at `now`: 1 when it is drawn, 0 once it has faded. */
export function laserOpacity(point: LaserPoint, now: number): number {
  return Math.min(1, Math.max(0, 1 - (now - point.time) / LASER_FADE_MS))
}

/** The strokes with at most {@link MAX_LASER_POINTS} of their newest points, without empty strokes. */
function keepNewest<T>(strokes: T[][]): T[][] {
  let room = MAX_LASER_POINTS
  const kept: T[][] = []
  for (let index = strokes.length - 1; index >= 0 && room > 0; index--) {
    const points = strokes[index]!.slice(-room)
    if (points.length === 0) continue
    room -= points.length
    kept.unshift(points)
  }
  return kept
}
