import { DEFAULT_FONT_FAMILY } from './autoWidth.ts'

/** Fonts that the toolbar offers: installed almost everywhere, with Cyrillic, and named as draw.io names them. */
export const FONT_FAMILIES = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New']

/** The font of text without a font of its own. */
export const DEFAULT_FONT = 'Arial'

/** The font of a style, with Arial for the default family of maxGraph. */
export function fontFamilyOf(style: { fontFamily?: unknown }): string {
  const family = typeof style.fontFamily === 'string' ? style.fontFamily.trim() : ''
  return family === '' || family === DEFAULT_FONT_FAMILY ? DEFAULT_FONT : family
}
