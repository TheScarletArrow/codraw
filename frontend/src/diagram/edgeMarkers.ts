import { edgeMarkerMessages as m } from './edgeMarkers.messages.ts'
import type { StyleValue } from './model.ts'
import { styleValues, type AnyStyle } from './styleValues.ts'

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

/**
 * The markers the toolbar offers for either end, in rows of six: arrows and triangles, diamonds, circles, a dash and a
 * cross, crow's feet.
 */
export const EDGE_MARKERS: readonly EdgeMarker[] = [
  marker('none', { arrow: 'none' }),
  marker('classic', { arrow: 'classic' }),
  marker('classicThin', { arrow: 'classicThin' }),
  marker('open', { arrow: 'open' }),
  marker('block', { arrow: 'block' }),
  marker(HOLLOW_TRIANGLE, { arrow: 'block', fill: false }),
  marker('diamond', { arrow: 'diamond' }),
  marker('diamondHollow', { arrow: 'diamond', fill: false }),
  marker('oval', { arrow: 'oval' }),
  marker('ovalHollow', { arrow: 'oval', fill: false }),
  marker('dash', { arrow: 'dash' }),
  marker('cross', { arrow: 'cross' }),
  marker('ERone', { arrow: 'ERone' }),
  marker('ERmandOne', { arrow: 'ERmandOne' }),
  marker('ERmany', { arrow: 'ERmany' }),
  marker('ERoneToMany', { arrow: 'ERoneToMany' }),
  marker('ERzeroToOne', { arrow: 'ERzeroToOne' }),
  marker('ERzeroToMany', { arrow: 'ERzeroToMany' }),
]

/** The end marker of edges without one of their own, as the default style of the editor sets it. */
export const DEFAULT_END_ARROW = 'classic'

/** The keys of the style of an end: its marker, whether the marker is filled, and its size. */
export const MARKER_KEYS: Readonly<
  Record<EdgeEnd, { arrow: 'startArrow' | 'endArrow'; fill: 'startFill' | 'endFill'; size: 'startSize' | 'endSize' }>
> = {
  start: { arrow: 'startArrow', fill: 'startFill', size: 'startSize' },
  end: { arrow: 'endArrow', fill: 'endFill', size: 'endSize' },
}

/** A flag of draw.io switched off in any of its spellings: it writes 0, CoDraw keeps `false`. */
const isOff = (value: unknown) => value === false || value === 0 || value === '0'

/** The marker of draw.io at an end of an edge with `style`; an end without one of its own has the editor's default. */
const arrowOf = (style: AnyStyle, end: EdgeEnd): StyleValue =>
  (styleValues(style)[MARKER_KEYS[end].arrow] as StyleValue | undefined) ?? (end === 'end' ? DEFAULT_END_ARROW : 'none')

/**
 * The marker of an end of an edge with `style`: the name of the marker of draw.io, or the hollow choice of
 * {@link EDGE_MARKERS}, such as {@link HOLLOW_TRIANGLE}, for a marker without a fill. An end without a marker of its own
 * has the default of the editor: none at the start, an arrow at the end.
 */
export function markerOf(style: AnyStyle, end: EdgeEnd): string {
  const arrow = String(arrowOf(style, end)) || 'none'
  const hollow =
    isOff(styleValues(style)[MARKER_KEYS[end].fill]) &&
    EDGE_MARKERS.find((choice) => choice.arrow === arrow && choice.fill === false)
  return hollow ? hollow.value : arrow
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

/**
 * The keys of the style that swap the markers of the ends of an edge with `style`, with their fills and sizes; an end
 * without a marker of its own gives the default of the editor, and a fill or a size that an end lacks is removed from
 * the other one.
 */
export function swappedMarkers(style: AnyStyle): Record<string, StyleValue | undefined> {
  const values = styleValues(style)
  const moved = (from: EdgeEnd, to: EdgeEnd) => ({
    [MARKER_KEYS[to].arrow]: arrowOf(style, from),
    [MARKER_KEYS[to].fill]: values[MARKER_KEYS[from].fill] as StyleValue | undefined,
    [MARKER_KEYS[to].size]: values[MARKER_KEYS[from].size] as StyleValue | undefined,
  })
  return { ...moved('end', 'start'), ...moved('start', 'end') }
}
