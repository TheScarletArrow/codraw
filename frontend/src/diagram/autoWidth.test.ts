import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { allowsAutoWidth, anchoredX, cssFont, fittedWidth, hasAutoWidth, hasTextWrap, wrapLabel } from './autoWidth.ts'
import { findShape, markedStyle, TABLE_FIELD_STYLE } from './shapes.ts'

describe('auto width', () => {
  it('is on with the draw.io key in any of its spellings', () => {
    expect(hasAutoWidth({ autosize: true })).toBe(true)
    expect(hasAutoWidth({ autosize: 1 })).toBe(true)
    expect(hasAutoWidth({ autosize: '1' })).toBe(true)
    expect(hasAutoWidth({ autosize: false })).toBe(false)
    expect(hasAutoWidth({})).toBe(false)
  })

  it('is allowed for shapes with the label inside', () => {
    expect(allowsAutoWidth({})).toBe(true)
    expect(allowsAutoWidth(markedStyle(findShape('rectangle')!))).toBe(true)
    expect(allowsAutoWidth(markedStyle(findShape('text')!))).toBe(true)
    expect(allowsAutoWidth(markedStyle(findShape('table')!))).toBe(true)
    expect(allowsAutoWidth(markedStyle(findShape('c4-container')!))).toBe(true)
    expect(allowsAutoWidth({ labelPosition: 'center', verticalLabelPosition: 'middle' })).toBe(true)
  })

  it('is not allowed for frames, labels outside the shape and shapes without a label', () => {
    expect(allowsAutoWidth(markedStyle(findShape('boundary')!))).toBe(false)
    expect(allowsAutoWidth(markedStyle(findShape('kubernetes-cluster')!))).toBe(false)
    expect(allowsAutoWidth(markedStyle(findShape('user')!))).toBe(false)
    expect(allowsAutoWidth(markedStyle(findShape('server')!))).toBe(false)
    expect(allowsAutoWidth({ labelPosition: 'right' })).toBe(false)
    expect(allowsAutoWidth({ noLabel: true })).toBe(false)
  })

  it('fits the text with its spacing and a margin, up to the grid', () => {
    // 45 + 2 × 2 (default spacing) + 2 × 8 (margin) = 65 → 70.
    expect(fittedWidth(45, {}, 10)).toBe(70)
    expect(fittedWidth(45, {}, 0)).toBe(65)
    // A field: 66 + 2 × 2 + 8 + 8 + 2 × 8 = 102 → 110.
    expect(fittedWidth(66, TABLE_FIELD_STYLE, 10)).toBe(110)
    expect(fittedWidth(40.2, { spacing: 0, spacingLeft: 10 }, 0)).toBe(41 + 10 + 16)
  })

  it('keeps the place of the label: the centre, the left or the right edge', () => {
    expect(anchoredX(100, 120, 60, 'center')).toBe(130)
    expect(anchoredX(100, 120, 200, 'center')).toBe(60)
    expect(anchoredX(100, 120, 60, 'left')).toBe(100)
    expect(anchoredX(100, 120, 60, 'right')).toBe(160)
  })

  it('draws the text with the font of the style', () => {
    expect(cssFont({})).toBe('13px Arial,Helvetica,sans-serif')
    expect(cssFont({ fontSize: 24, fontStyle: 3, fontFamily: 'Courier New' })).toBe('italic bold 24px Courier New')
    expect(cssFont({ fontStyle: 1, fontFamily: '' })).toBe('bold 13px Arial,Helvetica,sans-serif')
  })
})

describe('text wrap', () => {
  // jsdom measures no text: every letter is 10 pixels wide.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D)
  })
  afterAll(() => vi.restoreAllMocks())

  it('is on with the key of draw.io, unless the width follows the label', () => {
    expect(hasTextWrap({ whiteSpace: 'wrap' })).toBe(true)
    expect(hasTextWrap({})).toBe(false)
    expect(hasTextWrap({ whiteSpace: 'nowrap' })).toBe(false)
    expect(hasTextWrap({ whiteSpace: 'wrap', autosize: 1 })).toBe(false)
  })

  it('puts the words on lines that fit the shape without its spacing and margin', () => {
    // 120 − 2 × 2 (default spacing) − 2 × 8 (margin) = 100: ten letters a line.
    expect(wrapLabel('один два три четыре пять', {}, 120)).toBe('один два\nтри четыре\nпять')
    // 136 − 2 × 2 − 8 − 8 − 2 × 8 = 100.
    expect(wrapLabel('один два три четыре пять', { spacingLeft: 8, spacingRight: 8 }, 136)).toBe('один два\nтри четыре\nпять')
  })

  it('keeps a label that fits and the lines of the participant', () => {
    expect(wrapLabel('один два', {}, 120)).toBe('один два')
    expect(wrapLabel('один два три\nчетыре', {}, 120)).toBe('один два\nтри\nчетыре')
    expect(wrapLabel('', {}, 120)).toBe('')
  })

  it('breaks a word longer than a line between its letters', () => {
    expect(wrapLabel('уведомления от сервиса', {}, 120)).toBe('уведомлени\nя от\nсервиса')
    expect(wrapLabel('абв', {}, 0)).toBe('а\nб\nв')
  })

  it('does not wrap a label that auto width fitted the shape to', () => {
    const label = 'один два три четыре пять'
    expect(wrapLabel(label, {}, fittedWidth(label.length * 10, {}, 10))).toBe(label)
  })
})
