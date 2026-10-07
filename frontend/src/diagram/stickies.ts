import { measureLabel, textRoomHeight, textRoomWidth, wrapLabel, type LabelStyle } from './autoWidth.ts'
import { STICKY_COLORS } from './colors.ts'
import { STICKY_FONT_SIZE } from './shapes.ts'
import { LINE_HEIGHT, MIN_FONT_SIZE } from './textSize.ts'

/** Room for the rounding of lengths, in pixels. */
const EPSILON = 0.01

/**
 * The text size at which `text` fits a shape `width` × `height` with the spacing of `style`: the largest whole size
 * from `max` down to {@link MIN_FONT_SIZE} at which its lines, with `wrap` its words on lines of the width, fit the
 * height, and every word, without `wrap` every line, fits the width. A word does not break between its letters while a
 * smaller size keeps it whole, as in draw.io. {@link MIN_FONT_SIZE} when even that does not fit, `max` for a text
 * without words. Where the browser cannot measure text, only the lines count.
 */
export function fittedFontSize(
  text: string,
  style: LabelStyle,
  width: number,
  height: number,
  wrap: boolean,
  max = STICKY_FONT_SIZE,
): number {
  const largest = Math.max(MIN_FONT_SIZE, Math.floor(max))
  if (text.trim() === '') return largest
  const roomWidth = textRoomWidth(style, width)
  const roomHeight = textRoomHeight(style, height)
  const pieces = wrap ? text.split(/\s+/).filter(Boolean) : text.split('\n')
  const fits = (fontSize: number) => {
    const sized = { ...style, fontSize }
    const lines = (wrap ? wrapLabel(text, sized, width) : text).split('\n').length
    // Lines that fill the height exactly fit it, whatever the rounding of the line height.
    if (lines * fontSize * LINE_HEIGHT > roomHeight + EPSILON) return false
    return pieces.every((piece) => measureLabel(piece, sized) <= roomWidth)
  }
  for (let size = largest; size > MIN_FONT_SIZE; size--) {
    if (fits(size)) return size
  }
  return MIN_FONT_SIZE
}

/** The color of new stickies that this browser remembers. */
const STICKY_COLOR_KEY = 'codraw.sticky-color'

/** The color of new stickies within the page, for a browser that keeps no data for the site. */
let remembered: string | null = null

/** The color of new stickies: the one last chosen on the panel of stickies, yellow until then. */
export function stickyColor(): string {
  let color = remembered
  try {
    color = localStorage.getItem(STICKY_COLOR_KEY)
  } catch {
    // The browser keeps no data for the site: the color chosen on this page.
  }
  return STICKY_COLORS.find((sticky) => sticky.value === color)?.value ?? STICKY_COLORS[0].value
}

/** Makes a color of stickies the color of new stickies, here and after reloading; other colors are not kept. */
export function rememberStickyColor(color: string) {
  if (!STICKY_COLORS.some((sticky) => sticky.value === color)) return
  remembered = color
  try {
    localStorage.setItem(STICKY_COLOR_KEY, color)
  } catch {
    // The browser keeps no data for the site: the color is kept within this page.
  }
}
