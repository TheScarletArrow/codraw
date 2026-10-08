import type { ShapeStyle } from './shapes.ts'
import { measureLabel, numeric, type LabelStyle } from './textMeasure.ts'

export { cssFont, DEFAULT_FONT_FAMILY, measureLabel, type LabelStyle } from './textMeasure.ts'

/** Style key of auto width. draw.io has the same key for fitting a shape to its label, so files keep it. */
export const AUTO_WIDTH_KEY = 'autosize'

/** Style key of text wrap: draw.io wraps the words of a label with `whiteSpace=wrap`. */
export const TEXT_WRAP_KEY = 'whiteSpace'

/** Spacing of a label on each side when the style has none, as in maxGraph. */
const DEFAULT_SPACING = 2

/** Room on each side of the text, so that it does not touch the border of the shape. */
const MARGIN = 8

export type Align = 'left' | 'center' | 'right'

export function hasAutoWidth(style: Record<string, unknown>): boolean {
  const value = style[AUTO_WIDTH_KEY]
  return value === true || value === 1 || value === '1'
}

/** The words of the label wrap onto lines that fit the shape; auto width, which fits the shape to the lines, wins. */
export function hasTextWrap(style: Record<string, unknown>): boolean {
  return style[TEXT_WRAP_KEY] === 'wrap' && !hasAutoWidth(style)
}

/**
 * Whether the width of a shape may follow its label: the label is drawn inside the shape, and the shape is not a frame,
 * whose size is set by what it frames.
 */
export function allowsAutoWidth(style: ShapeStyle): boolean {
  if (style.pointerEvents === false || style.noLabel === true) return false
  const inside = (position: unknown) => position === undefined || position === 'center' || position === 'middle'
  return inside(style.labelPosition) && inside(style.verticalLabelPosition)
}

/** Width of a shape whose longest line of the label is `textWidth` wide: the text, the spacing, a margin, up to the grid. */
export function fittedWidth(textWidth: number, style: LabelStyle, gridSize: number): number {
  const spacing = numeric(style.spacing, DEFAULT_SPACING)
  const width =
    Math.ceil(textWidth) + 2 * spacing + numeric(style.spacingLeft, 0) + numeric(style.spacingRight, 0) + 2 * MARGIN
  return gridSize > 0 ? Math.ceil(width / gridSize) * gridSize : width
}

/** Left edge of a shape that changes its width from `width` to `fitted` and keeps the place of its label. */
export function anchoredX(x: number, width: number, fitted: number, align: Align): number {
  if (align === 'left') return x
  if (align === 'right') return x + width - fitted
  return x + Math.round((width - fitted) / 2)
}

/** Width of the room for the text in a shape `width` wide: what {@link fittedWidth} leaves for it. */
export function textRoomWidth(style: LabelStyle, width: number): number {
  const spacing = numeric(style.spacing, DEFAULT_SPACING)
  return width - 2 * spacing - numeric(style.spacingLeft, 0) - numeric(style.spacingRight, 0) - 2 * MARGIN
}

/** Height of the room for the lines of a label in a shape `height` high, with the same spacing and margins. */
export function textRoomHeight(style: LabelStyle, height: number): number {
  const spacing = numeric(style.spacing, DEFAULT_SPACING)
  return height - 2 * spacing - numeric(style.spacingTop, 0) - numeric(style.spacingBottom, 0) - 2 * MARGIN
}

/**
 * The label of a shape `width` wide with its words on lines that fit the room {@link fittedWidth} leaves for the text.
 * The lines of the label stay; a word longer than a line is broken between its letters.
 */
export function wrapLabel(text: string, style: LabelStyle, width: number): string {
  const room = textRoomWidth(style, width)
  const fits = (line: string) => measureLabel(line, style) <= room
  return text
    .split('\n')
    .flatMap((line) => (fits(line) ? [line] : wrapLine(line, fits)))
    .join('\n')
}

function wrapLine(line: string, fits: (line: string) => boolean): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of line.split(' ').filter(Boolean)) {
    const joined = current ? `${current} ${word}` : word
    if (fits(joined)) {
      current = joined
      continue
    }
    if (current) lines.push(current)
    current = ''
    if (fits(word)) {
      current = word
      continue
    }
    for (const letter of word) {
      if (current && !fits(current + letter)) {
        lines.push(current)
        current = ''
      }
      current += letter
    }
  }
  return [...lines, current]
}
