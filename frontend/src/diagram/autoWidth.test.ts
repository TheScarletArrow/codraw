import { describe, expect, it } from 'vitest'
import { allowsAutoWidth, anchoredX, cssFont, fittedWidth, hasAutoWidth } from './autoWidth.ts'
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
