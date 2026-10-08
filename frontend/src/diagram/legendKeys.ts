/**
 * The keys of a legend, apart from what it lists (see `legend.ts`), so that the palette can name the shape of a legend
 * without the palette in turn.
 */

/** The shape that draws a legend on the canvas; see `legendShapes.ts`. */
export const LEGEND_SHAPE = 'codraw.legend'

/** The shape of the palette, and so the mark (`codrawShape`), of a legend. */
export const LEGEND_PRESET = 'legend'

/** Style key of a legend: the names its participants gave its items and the items they hid; see `legend.ts`. */
export const LEGEND_KEY = 'codrawLegend'

/** Style key of the samples and names of a legend in a file of draw.io, which a file of CoDraw brings back as a legend. */
export const LEGEND_PART_KEY = 'codrawLegendPart'

/** The style is that of a legend: marked as one, or drawn as one. */
export function isLegendStyle(style: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return !!style && (style.codrawShape === LEGEND_PRESET || style.shape === LEGEND_SHAPE)
}
