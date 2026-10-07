import type { CellStateStyle } from '@maxgraph/core'

/**
 * The theme of a canvas. The light one draws the diagram as it is, as images of it and the canvases of other
 * participants do; the dark one draws it on a dark background, with black lines and text on the canvas shown light.
 */
export type CanvasTheme = 'light' | 'dark'

/** What black lines and text lying on the dark canvas are drawn with. */
export const DARK_CANVAS_INK = '#e6edf3'

/** The brightest channel of a color that still reads as black ink, e.g. of `#333333`, and how far its channels differ. */
const INK_MAX_CHANNEL = 0x40
const INK_MAX_SPREAD = 0x20

/** The channels of `#rgb` and `#rrggbb` colors and of `black`; `null` for anything else, e.g. `none`. */
function channels(color: string): [number, number, number] | null {
  const value = color.trim().toLowerCase()
  if (value === 'black') return [0, 0, 0]
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value)
  const pairs = short ? short.slice(1).map((digit) => digit + digit) : long?.slice(1)
  return pairs ? (pairs.map((pair) => parseInt(pair, 16)) as [number, number, number]) : null
}

/**
 * Black and the grays near it, `#000000` to `#404040`: the ink of a diagram on paper, which a dark background would
 * swallow. The default color of lines and text, «Чёрный» of the palette and the black of draw.io are all ink; dark
 * colors with a hue, e.g. a navy line, are not.
 */
export function isInk(color: unknown): boolean {
  if (typeof color !== 'string') return false
  const rgb = channels(color)
  return rgb !== null && Math.max(...rgb) <= INK_MAX_CHANNEL && Math.max(...rgb) - Math.min(...rgb) <= INK_MAX_SPREAD
}

/** A fill hides what lies under it: a color, not `none`, at least half opaque. */
function hides(style: CellStateStyle, key: 'fillColor' | 'swimlaneFillColor'): boolean {
  const color = style[key]
  if (typeof color !== 'string' || color === 'none' || color === 'transparent' || color === '') return false
  return Number(style.fillOpacity ?? 100) >= 50
}

/** The shape fills the area of its children: the body of a swimlane, e.g. a table, or the whole shape. */
export function coversChildren(style: CellStateStyle): boolean {
  return hides(style, style.shape === 'swimlane' ? 'swimlaneFillColor' : 'fillColor')
}

/** The label is placed outside the shape, e.g. the caption under «Пользователь». */
function labelOutside(style: CellStateStyle): boolean {
  const vertical = style.verticalLabelPosition
  const horizontal = style.labelPosition
  return vertical === 'top' || vertical === 'bottom' || horizontal === 'left' || horizontal === 'right'
}

function hasLabelBackground(style: CellStateStyle): boolean {
  const color = style.labelBackgroundColor
  return typeof color === 'string' && color !== 'none' && color !== 'transparent' && color !== ''
}

/**
 * The style a cell is drawn with on the dark canvas: the ink (see {@link isInk}) of its line and of its text that lie on
 * the canvas itself becomes {@link DARK_CANVAS_INK}. `onCanvas` tells that no shape that holds the cell fills the area
 * under it. On the canvas lie the line of an edge and of a shape without fill, the text of an edge without a label
 * background, and the text of a shape without fill or outside the shape. Lines and text over a fill, fills and every
 * other color stay as they are. The style of the document is not changed: a new style is returned.
 */
export function darkCanvasStyle<T extends CellStateStyle>(style: T, edge: boolean, onCanvas: boolean): T {
  if (!onCanvas) return style
  const filled = !edge && hides(style, 'fillColor')
  const strokeOnCanvas = !filled
  const textOnCanvas = (!filled || labelOutside(style)) && !hasLabelBackground(style)
  const stroke = strokeOnCanvas && isInk(style.strokeColor)
  const font = textOnCanvas && isInk(style.fontColor)
  if (!stroke && !font) return style
  return {
    ...style,
    ...(stroke && { strokeColor: DARK_CANVAS_INK }),
    ...(font && { fontColor: DARK_CANVAS_INK }),
  }
}
