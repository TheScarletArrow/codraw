import type { Box, Point } from './editor.ts'

/** An element on the canvas as the selection frame sees it, in the coordinates of the frame. */
export type RegionCandidate =
  | { kind: 'shape' | 'frame'; box: Box }
  | { kind: 'edge'; box: Box; points: Point[] }

/**
 * Whether the selection frame selects an element, as on the desktop of Windows: a shape that it touches, an edge
 * whose line crosses it. A frame (boundary) only when it is wholly inside: the selection frame often starts inside
 * a boundary, and would always select it.
 */
export function touchedByRegion(region: Box, candidate: RegionCandidate): boolean {
  switch (candidate.kind) {
    case 'shape':
      return boxesIntersect(region, candidate.box)
    case 'frame':
      return boxContains(region, candidate.box)
    case 'edge':
      return candidate.points.some((point, index) => {
        const next = candidate.points[index + 1]
        return next ? segmentTouchesBox(point, next, region) : candidate.points.length === 1 && boxContainsPoint(region, point)
      })
  }
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
}

function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

function boxContainsPoint(box: Box, { x, y }: Point): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
}

/** Liang–Barsky: clips the segment from `p` to `q` by the box; it touches the box when something is left. */
function segmentTouchesBox(p: Point, q: Point, box: Box): boolean {
  const dx = q.x - p.x
  const dy = q.y - p.y
  let enter = 0
  let leave = 1
  const sides: [number, number][] = [
    [-dx, p.x - box.x],
    [dx, box.x + box.width - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.height - p.y],
  ]
  for (const [direction, distance] of sides) {
    if (direction === 0) {
      // Parallel to this side: outside of it means outside of the box.
      if (distance < 0) return false
      continue
    }
    const t = distance / direction
    if (direction < 0) enter = Math.max(enter, t)
    else leave = Math.min(leave, t)
    if (enter > leave) return false
  }
  return true
}
