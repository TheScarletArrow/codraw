import type { Box } from './editor.ts'

/** The style key of the clockwise rotation of a shape around its centre in degrees, as draw.io names it. */
export const ROTATION_KEY = 'rotation'

/** The angle as a whole number of degrees from 0 to 359, e.g. 270 for −90 and 0 for 360; `null` for no number. */
export function normalizeRotation(angle: number): number | null {
  if (!Number.isFinite(angle)) return null
  return ((Math.round(angle) % 360) + 360) % 360
}

/** The rotation of a shape with `style`, from 0 up to 360; a shape without the key, or with no number in it, is not turned. */
export function rotationOf(style: Record<string, unknown>): number {
  const rotation = Number(style[ROTATION_KEY] ?? 0)
  return Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0
}

/** The box around `box` turned around its centre by `rotation` degrees; the box itself when it is not turned. */
export function rotatedBounds(box: Box, rotation: number): Box {
  if (rotation % 360 === 0) return box
  const radians = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const width = box.width * cos + box.height * sin
  const height = box.width * sin + box.height * cos
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }
}
