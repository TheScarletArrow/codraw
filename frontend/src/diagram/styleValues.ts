import type { CellStateStyle } from '@maxgraph/core'

/**
 * A style read key by key: the style of a cell of maxGraph or a record of the model. maxGraph declares its style as an
 * interface, which TypeScript does not take for a record of any keys, so the helpers that read keys of CoDraw from a
 * style take either and read it with {@link styleValues}.
 */
export type AnyStyle = CellStateStyle | Readonly<Record<string, unknown>>

/** The values of a style by key. */
export const styleValues = (style: AnyStyle): Readonly<Record<string, unknown>> => style as Readonly<Record<string, unknown>>
