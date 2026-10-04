import type { Box, Point } from './editor.ts'
import type { ShapeStyle } from './shapes.ts'

/** Side of a shape where the arrow that adds a connected shape is. */
export type Side = 'left' | 'right' | 'top' | 'bottom'

/** Distance between the borders of the source and the new connected shape. */
export const QUICK_CONNECT_GAP = 80
const GRID = 10
/** Space between the new shape and a shape in the way when it is shifted past it. */
const SHIFT_SPACING = 20

/** Frames let clicks through to the shapes under them, and a new shape may be placed inside one as well. */
export function blocksPlacement(style: ShapeStyle): boolean {
  return style.pointerEvents !== false
}

/**
 * Top-left corner of a new shape connected to `source` on `side`: at the gap from the source, snapped to the grid,
 * and exactly on the axis of the source, so that the edge between them is straight. While a shape in the way
 * overlaps it, the new shape moves along the side by whole grid steps: down for the left and right sides, to the
 * right for the top and bottom ones.
 */
export function placeConnected(
  source: Box,
  size: { width: number; height: number },
  side: Side,
  obstacles: Box[],
): Point {
  const snap = (value: number) => Math.round(value / GRID) * GRID
  const step = (length: number) => Math.ceil((length + SHIFT_SPACING) / GRID) * GRID
  const centerX = source.x + source.width / 2
  const centerY = source.y + source.height / 2
  let x =
    side === 'left'
      ? snap(source.x - QUICK_CONNECT_GAP - size.width)
      : side === 'right'
        ? snap(source.x + source.width + QUICK_CONNECT_GAP)
        : centerX - size.width / 2
  let y =
    side === 'top'
      ? snap(source.y - QUICK_CONNECT_GAP - size.height)
      : side === 'bottom'
        ? snap(source.y + source.height + QUICK_CONNECT_GAP)
        : centerY - size.height / 2
  const overlaps = (box: Box) =>
    box.x < x + size.width && x < box.x + box.width && box.y < y + size.height && y < box.y + box.height
  while (obstacles.some(overlaps)) {
    if (side === 'left' || side === 'right') y += step(size.height)
    else x += step(size.width)
  }
  return { x, y }
}
