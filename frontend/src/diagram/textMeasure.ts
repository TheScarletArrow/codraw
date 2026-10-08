/**
 * Measuring labels, without the shapes of the palette or maxGraph: what lays out a diagram also where no editor is, e.g.
 * a `.drawio` file written from the document, measures them the same way as the canvas.
 */

/** Text size of shapes and edges without their own, set by the default styles of the editor. */
export const DEFAULT_FONT_SIZE = 13

/** Line height of maxGraph labels relative to the text size. */
export const LINE_HEIGHT = 1.2

/** Font of labels without their own, as in maxGraph. */
export const DEFAULT_FONT_FAMILY = 'Arial,Helvetica,sans-serif'

/** Style keys that place and draw a label. */
export interface LabelStyle {
  fontSize?: unknown
  fontFamily?: unknown
  fontStyle?: unknown
  spacing?: unknown
  spacingLeft?: unknown
  spacingRight?: unknown
  spacingTop?: unknown
  spacingBottom?: unknown
}

/** A number of a style, or `fallback` for none or something that is not a number. */
export const numeric = (value: unknown, fallback: number) => {
  const result = Number(value)
  return value === undefined || value === null || value === '' || !Number.isFinite(result) ? fallback : result
}

/** The CSS font of a label: italic and bold from the flags of `fontStyle`, the size and the family. */
export function cssFont(style: LabelStyle): string {
  const flags = numeric(style.fontStyle, 0)
  const family = typeof style.fontFamily === 'string' && style.fontFamily.trim() ? style.fontFamily : DEFAULT_FONT_FAMILY
  return [flags & 2 ? 'italic' : '', flags & 1 ? 'bold' : '', `${numeric(style.fontSize, DEFAULT_FONT_SIZE)}px`, family]
    .filter(Boolean)
    .join(' ')
}

let context: CanvasRenderingContext2D | null | undefined

/** Width of the longest line of a label drawn with its font, in pixels; 0 where the browser cannot measure text. */
export function measureLabel(text: string, style: LabelStyle): number {
  context ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  const measuring = context
  if (!measuring) return 0
  measuring.font = cssFont(style)
  return Math.max(0, ...text.split('\n').map((line) => measuring.measureText(line).width))
}
