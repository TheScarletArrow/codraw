import { TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from './shapes.ts'
import { LINE_HEIGHT } from './textMeasure.ts'

/** Sizes that «Уменьшить текст» and «Увеличить текст» step through, as in text editors. */
export const FONT_SIZES = [6, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96] as const

export const MIN_FONT_SIZE = FONT_SIZES[0]
export const MAX_FONT_SIZE = FONT_SIZES[FONT_SIZES.length - 1]

export { DEFAULT_FONT_SIZE, LINE_HEIGHT } from './textMeasure.ts'

export function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)))
}

/**
 * The next size of the row up (`1`) or down (`-1`) from `size`, which may lie between sizes of the row or beyond it,
 * e.g. in a `.drawio` file; `size` itself when the row has nothing further that way.
 */
export function nextFontSize(size: number, direction: 1 | -1): number {
  const next = direction > 0 ? FONT_SIZES.find((step) => step > size) : FONT_SIZES.findLast((step) => step < size)
  return next ?? size
}

/** Height of a table field that fits one line of text of this size; the usual height for the usual size. */
export function tableFieldHeight(fontSize: number): number {
  return Math.max(TABLE_FIELD_HEIGHT, Math.ceil(LINE_HEIGHT * fontSize) + 10)
}

/** Height of a table header that fits its name of this size; the usual height for the usual size. */
export function tableHeaderHeight(fontSize: number): number {
  return Math.max(TABLE_HEADER_HEIGHT, Math.ceil(LINE_HEIGHT * fontSize) + 14)
}
