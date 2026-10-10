import { edgeMarkerMessages as m } from './edgeMarkers.messages.ts'
import type { StyleValue } from './model.ts'

/**
 * The markers of the ends of an edge as data, without maxGraph: the toolbar offers them, the editor reads and writes
 * them, a legend tells edges apart by them.
 */

export type EdgeEnd = 'start' | 'end'

/** A choice of the marker of an end: the marker of draw.io, filled unless `fill` is false. */
export interface EdgeMarker {
  /** What tells the choice from others; the name of the marker of draw.io unless a fill tells it apart. */
  value: string
  label: string
  /** `startArrow` or `endArrow` of draw.io. */
  arrow: string
  fill?: false
}

/** The hollow triangle of a generalization of UML: `block` without a fill, as draw.io writes it. */
export const HOLLOW_TRIANGLE = 'blockHollow'

/** A choice of a marker named in the language of the interface. */
const marker = (value: keyof typeof m, choice: Omit<EdgeMarker, 'value' | 'label'>): EdgeMarker => ({
  value,
  get label() {
    return m[value]
  },
  ...choice,
})

/** The markers the toolbar offers for either end. */
export const EDGE_MARKERS: readonly EdgeMarker[] = [
  marker('classic', { arrow: 'classic' }),
  marker('none', { arrow: 'none' }),
  marker('ERone', { arrow: 'ERone' }),
  marker('ERmandOne', { arrow: 'ERmandOne' }),
  marker('ERmany', { arrow: 'ERmany' }),
  marker('ERoneToMany', { arrow: 'ERoneToMany' }),
  marker('ERzeroToOne', { arrow: 'ERzeroToOne' }),
  marker('ERzeroToMany', { arrow: 'ERzeroToMany' }),
  marker('open', { arrow: 'open' }),
  marker(HOLLOW_TRIANGLE, { arrow: 'block', fill: false }),
]

/** The end marker of edges without one of their own, as the default style of the editor sets it. */
export const DEFAULT_END_ARROW = 'classic'

/** The keys of the style of an end: its marker and whether the marker is filled. */
export const MARKER_KEYS: Readonly<Record<EdgeEnd, { arrow: 'startArrow' | 'endArrow'; fill: 'startFill' | 'endFill' }>> = {
  start: { arrow: 'startArrow', fill: 'startFill' },
  end: { arrow: 'endArrow', fill: 'endFill' },
}

/** A flag of draw.io switched off in any of its spellings: it writes 0, CoDraw keeps `false`. */
const isOff = (value: unknown) => value === false || value === 0 || value === '0'

/**
 * The marker of an end of an edge with `style`: the name of the marker of draw.io, or {@link HOLLOW_TRIANGLE} for a
 * `block` without a fill. An end without a marker of its own has the default of the editor: none at the start, an
 * arrow at the end.
 */
export function markerOf(style: Readonly<Record<string, unknown>>, end: EdgeEnd): string {
  const keys = MARKER_KEYS[end]
  const arrow = String(style[keys.arrow] ?? (end === 'end' ? DEFAULT_END_ARROW : 'none')) || 'none'
  return arrow === 'block' && isOff(style[keys.fill]) ? HOLLOW_TRIANGLE : arrow
}

/**
 * The keys of the style that give an end the marker `value` of {@link EDGE_MARKERS}, or of draw.io: the marker, and
 * no fill for a hollow one; `undefined` removes the key, so a filled marker keeps the default of draw.io.
 */
export function markerChanges(value: string, end: EdgeEnd): Record<string, StyleValue | undefined> {
  const keys = MARKER_KEYS[end]
  const marker = EDGE_MARKERS.find((choice) => choice.value === value)
  return { [keys.arrow]: marker?.arrow ?? value, [keys.fill]: marker?.fill === false ? false : undefined }
}
