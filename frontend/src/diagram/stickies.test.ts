import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { STICKY_COLORS } from './colors.ts'
import { findShape, STICKY_FONT_SIZE } from './shapes.ts'
import { fittedFontSize, rememberStickyColor, stickyColor } from './stickies.ts'

describe('the text size that fits a sticky', () => {
  // jsdom measures no text: every character is half the size of the font wide.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText(this: { font: string }, text: string) {
        return { width: text.length * 0.5 * parseFloat(/([\d.]+)px/.exec(this.font)![1]!) }
      },
    } as unknown as CanvasRenderingContext2D)
  })

  // A new sticky: 160 × 160, 140 wide and 126 high for the text.
  const style = findShape('sticky')!.style
  const fit = (text: string, wrap = true, width = 160, height = 160) => fittedFontSize(text, style, width, height, wrap)
  const words = (count: number) => Array.from({ length: count }, () => 'слово').join(' ')

  it('keeps the largest size for a short text and for no text', () => {
    expect(fit('Медленный CI')).toBe(STICKY_FONT_SIZE)
    expect(fit('')).toBe(STICKY_FONT_SIZE)
    expect(fit(' \n ')).toBe(STICKY_FONT_SIZE)
  })

  it('takes the largest whole size at which the wrapped lines fit the height', () => {
    // 4 words a line at 12 (138 of 140), 8 lines of 14.4 in 126; at 13 only 3 words a line, 10 lines.
    expect(fit(words(30))).toBe(12)
  })

  it('grows with the room the sticky gives, up to the largest size', () => {
    expect(fit(words(30), true, 320, 320)).toBeGreaterThan(12)
    expect(fit(words(3), true, 640, 640)).toBe(STICKY_FONT_SIZE)
    expect(fittedFontSize(words(3), style, 640, 640, true, 40)).toBe(40)
  })

  it('makes a word longer than a line smaller instead of breaking it', () => {
    // 30 letters are 15 sizes wide: 9 × 15 = 135 of 140.
    expect(fit('а'.repeat(30))).toBe(9)
  })

  it('fits every line of a text without wrap into the width', () => {
    // 29 characters on a line: 9 × 14.5 = 130.5 of 140.
    expect(fit(`${words(5)}\nкоротко`, false)).toBe(9)
    expect(fit(words(5), true)).toBe(STICKY_FONT_SIZE)
  })

  it('fits lines that fill the height exactly', () => {
    // 7 lines of 15 × 1.2 are the 126 of the room.
    expect(fit(Array.from({ length: 7 }, () => 'а').join('\n'))).toBe(15)
  })

  it('keeps the smallest size for a text that does not fit at all', () => {
    expect(fit(words(300))).toBe(6)
  })
})

describe('the color of new stickies', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is yellow until another color of stickies is chosen, which the browser remembers', () => {
    expect(stickyColor()).toBe(STICKY_COLORS[0].value)

    rememberStickyColor('#f8cecc')

    expect(stickyColor()).toBe('#f8cecc')
    expect(localStorage.getItem('codraw.sticky-color')).toBe('#f8cecc')
  })

  it('keeps no color other than those of stickies', () => {
    rememberStickyColor('#000000')
    expect(stickyColor()).toBe(STICKY_COLORS[0].value)

    localStorage.setItem('codraw.sticky-color', 'red')
    expect(stickyColor()).toBe(STICKY_COLORS[0].value)
  })

  it('is kept within the page when the browser keeps no data for the site', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    rememberStickyColor('#dae8fc')

    expect(stickyColor()).toBe('#dae8fc')
  })
})
