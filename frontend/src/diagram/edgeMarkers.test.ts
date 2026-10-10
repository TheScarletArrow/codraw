import { describe, expect, it } from 'vitest'
import { formatStyle, parseStyle } from '../drawio/style.ts'
import { EDGE_MARKERS, HOLLOW_TRIANGLE, markerChanges, markerOf } from './edgeMarkers.ts'

describe('markers of the ends of an edge', () => {
  it('offer the open arrow and the hollow triangle of UML after the crow’s feet', () => {
    expect(EDGE_MARKERS.map((marker) => marker.label).slice(-2)).toEqual(['Открытая стрелка', 'Полый треугольник'])
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
