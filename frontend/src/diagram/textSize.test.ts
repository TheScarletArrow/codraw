import { describe, expect, it } from 'vitest'
import { TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from './shapes.ts'
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  nextFontSize,
  tableFieldHeight,
  tableHeaderHeight,
} from './textSize.ts'

describe('text sizes', () => {
  it('step to the neighbour of the row', () => {
    expect(nextFontSize(13, 1)).toBe(14)
    expect(nextFontSize(13, -1)).toBe(12)
    expect(nextFontSize(20, 1)).toBe(24)
    expect(nextFontSize(48, -1)).toBe(36)
  })

  it('step from a size between sizes of the row to the nearest one that way', () => {
    expect(nextFontSize(15, 1)).toBe(16)
    expect(nextFontSize(15, -1)).toBe(14)
    expect(nextFontSize(10.5, 1)).toBe(11)
  })

  it('stay at the ends of the row, and come back into it from beyond', () => {
    expect(nextFontSize(MAX_FONT_SIZE, 1)).toBe(MAX_FONT_SIZE)
    expect(nextFontSize(MIN_FONT_SIZE, -1)).toBe(MIN_FONT_SIZE)
    expect(nextFontSize(120, -1)).toBe(96)
    expect(nextFontSize(120, 1)).toBe(120)
    expect(nextFontSize(4, 1)).toBe(6)
  })

  it('keep typed sizes within the limits as whole numbers', () => {
    expect(clampFontSize(500)).toBe(96)
    expect(clampFontSize(0)).toBe(6)
    expect(clampFontSize(17.4)).toBe(17)
  })

  it('include the default size, so that stepping from it is even', () => {
    expect(FONT_SIZES).toContain(DEFAULT_FONT_SIZE)
    expect([...FONT_SIZES].sort((a, b) => a - b)).toEqual([...FONT_SIZES])
  })
})

describe('table heights', () => {
  it('are the usual ones for the usual text size', () => {
    expect(tableFieldHeight(DEFAULT_FONT_SIZE)).toBe(TABLE_FIELD_HEIGHT)
    expect(tableHeaderHeight(DEFAULT_FONT_SIZE)).toBe(TABLE_HEADER_HEIGHT)
    expect(tableFieldHeight(8)).toBe(TABLE_FIELD_HEIGHT)
  })

  it('grow with large text to fit a line of it', () => {
    expect(tableFieldHeight(24)).toBe(39)
    expect(tableHeaderHeight(24)).toBe(43)
    expect(tableFieldHeight(48)).toBeGreaterThan(48 * 1.2)
  })
})
