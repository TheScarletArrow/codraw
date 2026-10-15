import { describe, expect, it } from 'vitest'
import { formatStyle, parseStyle } from '../drawio/style.ts'
import { EDGE_MARKERS, HOLLOW_TRIANGLE, markerChanges, markerOf, swappedMarkers } from './edgeMarkers.ts'

describe('markers of the ends of an edge', () => {
  it('offer arrows, diamonds, circles, a dash and a cross, and crow’s feet, in rows of six', () => {
    expect(EDGE_MARKERS.map((marker) => marker.label)).toEqual([
      'Без маркера',
      'Стрелка',
      'Тонкая стрелка',
      'Открытая стрелка',
      'Треугольник',
      'Полый треугольник',
      'Ромб',
      'Полый ромб',
      'Точка',
      'Круг',
      'Черта',
      'Крест',
      'Один',
      'Обязательно один',
      'Много',
      'Один или много',
      'Ноль или один',
      'Ноль или много',
    ])
    expect(new Set(EDGE_MARKERS.map((marker) => marker.value)).size).toBe(EDGE_MARKERS.length)
  })

  it('read the defaults of the editor at ends without markers of their own', () => {
    expect(markerOf({}, 'start')).toBe('none')
    expect(markerOf({}, 'end')).toBe('classic')
    expect(markerOf({ endArrow: '' }, 'end')).toBe('none')
  })

  it('read a block without a fill, in any spelling of draw.io, as the hollow triangle', () => {
    expect(markerOf({ endArrow: 'block', endFill: false }, 'end')).toBe(HOLLOW_TRIANGLE)
    expect(markerOf({ endArrow: 'block', endFill: 0 }, 'end')).toBe(HOLLOW_TRIANGLE)
    expect(markerOf({ startArrow: 'block', startFill: '0' }, 'start')).toBe(HOLLOW_TRIANGLE)
    // A filled block of a file stays what it is, and the fill of the other end does not count.
    expect(markerOf({ endArrow: 'block' }, 'end')).toBe('block')
    expect(markerOf({ endArrow: 'block', startFill: false }, 'end')).toBe('block')
    expect(markerOf({ endArrow: 'open', endFill: false }, 'end')).toBe('open')
  })

  it('read a diamond and an oval without a fill as their hollow choices', () => {
    expect(markerOf({ startArrow: 'diamond', startFill: 0 }, 'start')).toBe('diamondHollow')
    expect(markerOf({ endArrow: 'oval', endFill: false }, 'end')).toBe('ovalHollow')
    expect(markerOf({ endArrow: 'diamond' }, 'end')).toBe('diamond')
    expect(markerOf({ endArrow: 'oval', startFill: false }, 'end')).toBe('oval')
    expect(markerChanges('diamondHollow', 'start')).toEqual({ startArrow: 'diamond', startFill: false })
    expect(markerChanges('oval', 'end')).toEqual({ endArrow: 'oval', endFill: undefined })
  })

  it('swap the markers of the ends with their fills and sizes', () => {
    expect(swappedMarkers({ startArrow: 'diamond', endArrow: 'block', endFill: false, endSize: 16 })).toEqual({
      startArrow: 'block',
      startFill: false,
      startSize: 16,
      endArrow: 'diamond',
      endFill: undefined,
      endSize: undefined,
    })
    // The ends without markers of their own: none at the start, the arrow of the editor at the end.
    expect(swappedMarkers({})).toMatchObject({ startArrow: 'classic', endArrow: 'none' })
  })

  it('write the marker and its fill, and remove the fill of filled markers', () => {
    expect(markerChanges(HOLLOW_TRIANGLE, 'end')).toEqual({ endArrow: 'block', endFill: false })
    expect(markerChanges('open', 'start')).toEqual({ startArrow: 'open', startFill: undefined })
    expect(markerChanges('ERmany', 'end')).toEqual({ endArrow: 'ERmany', endFill: undefined })
  })

  it('go to draw.io and back as its markers', () => {
    const style = { endArrow: 'block', endFill: false, startArrow: 'open' }
    const text = formatStyle(style, 'edge')

    expect(text).toContain('endArrow=block')
    expect(text).toContain('endFill=0')
    expect(text).toContain('startArrow=open')
    const back = parseStyle(text, 'edge')
    expect(markerOf(back, 'end')).toBe(HOLLOW_TRIANGLE)
    expect(markerOf(back, 'start')).toBe('open')
  })
})
