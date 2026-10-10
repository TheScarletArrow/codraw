import { DEFAULT_FILL_COLOR, DEFAULT_LINE_COLOR, PALETTE } from './colors.ts'
import { HOLLOW_TRIANGLE, markerOf } from './edgeMarkers.ts'
import {
  FRAME_SHAPES,
  INTERACTION_KEY,
  isElementKind,
  isInteraction,
  propertyLine,
  PROPERTY_LIMITS,
  TECHNOLOGY_KEY,
} from './elementKinds.ts'
import { isFreehandStyle } from './freehand.ts'
import { legendMessages as m } from './legend.messages.ts'
import { isImageStyle } from './images.ts'
import { isLegendStyle, LEGEND_KEY } from './legendKeys.ts'
import { ELEMENT_STYLE_KEYS } from './model.ts'
import { isSequenceStyle, sequencePartOf } from './sequence.ts'
import { findShape, isStickyStyle, isTableStyle, SHAPES, shapeOf, type ShapeId, type ShapeStyle } from './shapes.ts'
import { DEFAULT_FONT_SIZE, LINE_HEIGHT, numeric, type LabelStyle } from './textMeasure.ts'

export { isLegendStyle, LEGEND_KEY, LEGEND_PART_KEY, LEGEND_PRESET, LEGEND_SHAPE } from './legendKeys.ts'
export { DEFAULT_END_ARROW } from './edgeMarkers.ts'

/**
 * A legend lists what its page has, so it never drifts apart from it: the kinds of shapes — by the shape of the palette,
 * the kind of their element and their fill when it is not that of the palette — and the kinds of edges — by their line,
 * the markers of their ends, their color, the interaction and the technology of their properties. Nothing of it is
 * stored but what its participants changed: the names they gave items and the items they hid ({@link LEGEND_KEY});
 * every participant lists the items of the page anew, the canvas from its model, a file from the document. The items
 * and the layout are data, without maxGraph, so that a `.drawio` file lays a legend out as the canvas does.
 */

/** A cell of a page as a legend reads it: from the document or from the model of the canvas. */
export interface LegendRecord {
  id: string
  kind: 'vertex' | 'edge'
  parent: string | null
  style: Record<string, unknown>
}

/** A kind of shapes or edges of a page. */
export interface LegendItem {
  /** What tells the item from others, the same for every participant; the names and the hiding keep to it. */
  key: string
  type: 'shape' | 'edge'
  /** The name of the item unless the legend names it otherwise. */
  name: string
  /** The cell whose look the sample shows: the first one of the item in the order of the records. */
  cellId: string
  /** The width of the sample of a shape to its height, as the shape of the palette has them. */
  ratio: number
}

/** What the participants changed in a legend: names of items by their keys, and the keys of hidden items. */
export interface LegendSettings {
  names: Record<string, string>
  hidden: string[]
}

const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/** A color as a key: lower case, without spaces; `none` stays. */
const colorKey = (value: unknown) => String(value).trim().toLowerCase()

/** A color in words: its name in the palette in lower case, «без заливки» for none, otherwise the color as written. */
export function colorWord(color: string): string {
  if (color === 'none') return m.noFill
  const named = PALETTE.find((entry) => entry.value === color)
  return named ? named.name.toLowerCase() : color
}

/** Shapes of the palette that are text or lists of text, not a kind of shapes. */
const TEXT_SHAPES = new Set<string>(['text', 'grid-table', 'list', 'sticky', 'sequence'])

/** The place of a shape of the palette in it: what orders the items of shapes. */
const PALETTE_ORDER = new Map<ShapeId, number>()
SHAPES.forEach((shape, index) => {
  if (!PALETTE_ORDER.has(shape.id)) PALETTE_ORDER.set(shape.id, index)
})

/** The item of a shape, or `null` for a shape that no legend lists. */
function shapeItem(record: LegendRecord, parent: LegendRecord | undefined): (LegendItem & { order: number }) | null {
  const style = record.style
  if (isLegendStyle(style) || isStickyStyle(style) || isSequenceStyle(style)) return null
  // A picture of the participant is no kind of shapes; a logo of the palette, e.g. Kafka, is.
  if (isImageStyle(style) && !findShape(String(style.codrawShape ?? ''))) return null
  if (sequencePartOf(style) !== null || TEXT_SHAPES.has(String(style.codrawShape ?? ''))) return null
  // A field of a table, a part of a sequence diagram, a label of an edge.
  if (parent && (parent.kind === 'edge' || isTableStyle(parent.style as ShapeStyle) || isSequenceStyle(parent.style))) return null
  const preset = shapeOf(style as ShapeStyle)
  if (!preset || TEXT_SHAPES.has(preset.id)) return null
  // A frame stands for what it frames: its kind is not a kind of shapes.
  const kindValue = style[ELEMENT_STYLE_KEYS.kind]
  const kind = !FRAME_SHAPES[preset.id] && isElementKind(kindValue) && kindValue !== preset.id ? kindValue : null
  const paletteFill = colorKey(preset.style.fillColor ?? DEFAULT_FILL_COLOR)
  const fill = style.fillColor === undefined || style.fillColor === null ? null : colorKey(style.fillColor)
  const ownFill = fill !== null && fill !== '' && fill !== paletteFill ? fill : null
  const base = kind ? (findShape(kind)?.label ?? kind) : preset.label
  return {
    key: `shape:${preset.id}${kind ? `|kind:${kind}` : ''}${ownFill ? `|fill:${ownFill}` : ''}`,
    type: 'shape',
    name: ownFill ? `${base}, ${colorWord(ownFill)}` : base,
    cellId: record.id,
    ratio: preset.height > 0 ? preset.width / preset.height : 1,
    order: PALETTE_ORDER.get(preset.id) ?? SHAPES.length,
  }
}

/** The item of an edge, or `null` for a line drawn by hand. */
function edgeItem(record: LegendRecord): LegendItem | null {
  const style = record.style
  if (isFreehandStyle(style)) return null
  const dashed = isOn(style.dashed)
  // A hollow triangle is a marker of its own, apart from a filled one.
  const start = markerOf(style, 'start')
  const end = markerOf(style, 'end')
  const stroke = style.strokeColor === undefined || style.strokeColor === null ? null : colorKey(style.strokeColor)
  const ownStroke = stroke !== null && stroke !== '' && stroke !== DEFAULT_LINE_COLOR ? stroke : null
  const interaction = isInteraction(style[INTERACTION_KEY]) ? style[INTERACTION_KEY] : null
  const technology = propertyLine(style[TECHNOLOGY_KEY], PROPERTY_LIMITS.technology)
  const notes: string[] = []
  if (dashed) notes.push(m.dashed)
  if (start === 'none' && end === 'none') notes.push(m.noArrow)
  else if (start !== 'none' && end !== 'none') notes.push(m.bothWays)
  // The markers of UML tell relations of use cases apart.
  if (start === 'open' || end === 'open') notes.push(m.openArrow)
  if (start === HOLLOW_TRIANGLE || end === HOLLOW_TRIANGLE) notes.push(m.hollowTriangle)
  if (ownStroke) notes.push(ownStroke === 'none' ? m.noLine : colorWord(ownStroke))
  const head = interaction ? m.interactionEdge[interaction] : m.edge
  return {
    key: `edge:${JSON.stringify([dashed ? 1 : 0, start, end, ownStroke ?? '', interaction ?? '', technology])}`,
    type: 'edge',
    name: [head, ...notes].join(', ') + (technology ? ` [${technology}]` : ''),
    cellId: record.id,
    ratio: 1,
  }
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The items of a page: the kinds of its shapes in the order of the palette, then by name, then the kinds of its edges by
 * name. The order does not depend on the order of the cells, so every participant has the same; the sample of an item is
 * its first cell in the order of `records`.
 */
export function legendItems(records: readonly LegendRecord[]): LegendItem[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  const shapes = new Map<string, LegendItem & { order: number }>()
  const edges = new Map<string, LegendItem>()
  for (const record of records) {
    if (record.kind === 'edge') {
      const item = edgeItem(record)
      if (item && !edges.has(item.key)) edges.set(item.key, item)
      continue
    }
    const item = shapeItem(record, record.parent === null ? undefined : byId.get(record.parent))
    if (item && !shapes.has(item.key)) shapes.set(item.key, item)
  }
  const sortedShapes = [...shapes.values()].sort((a, b) => a.order - b.order || byText(a.name, b.name) || byText(a.key, b.key))
  const sortedEdges = [...edges.values()].sort((a, b) => byText(a.name, b.name) || byText(a.key, b.key))
  return [...sortedShapes.map(({ order: _order, ...item }) => item), ...sortedEdges]
}

/** The settings of a legend from its style; anything else than what {@link legendSettingsValue} writes counts as none. */
export function legendSettings(style: Readonly<Record<string, unknown>> | null | undefined): LegendSettings {
  const settings: LegendSettings = { names: {}, hidden: [] }
  const raw = style?.[LEGEND_KEY]
  if (typeof raw !== 'string' || raw === '') return settings
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(raw))
  } catch {
    return settings
  }
  if (!parsed || typeof parsed !== 'object') return settings
  const { names, hidden } = parsed as { names?: unknown; hidden?: unknown }
  if (names && typeof names === 'object' && !Array.isArray(names)) {
    for (const [key, value] of Object.entries(names)) {
      const name = propertyLine(value, PROPERTY_LIMITS.name)
      if (name) settings.names[key] = name
    }
  }
  if (Array.isArray(hidden)) settings.hidden = [...new Set(hidden.filter((key): key is string => typeof key === 'string' && key !== ''))]
  return settings
}

/**
 * The settings as the value of {@link LEGEND_KEY}: JSON in `encodeURIComponent`, which has no `;`, `=` or `,` and so
 * goes through a style of draw.io as it is; `undefined` for a legend nobody changed.
 */
export function legendSettingsValue(settings: LegendSettings): string | undefined {
  const names: Record<string, string> = {}
  for (const key of Object.keys(settings.names).sort()) {
    const name = propertyLine(settings.names[key], PROPERTY_LIMITS.name)
    if (name) names[key] = name
  }
  const hidden = [...new Set(settings.hidden.filter(Boolean))].sort()
  if (Object.keys(names).length === 0 && hidden.length === 0) return undefined
  return encodeURIComponent(JSON.stringify({ ...(Object.keys(names).length > 0 && { names }), ...(hidden.length > 0 && { hidden }) }))
}

/** How many items a legend shows at most; the others are counted in a last row. */
export const MAX_LEGEND_ROWS = 30

/** A row of a legend: an item with its sample, the count of items beyond the limit, or the line of an empty legend. */
export type LegendRow =
  | { type: 'shape' | 'edge'; key: string; label: string; cellId: string; ratio: number }
  | { type: 'more' | 'empty'; key: null; label: string; cellId: null; ratio: number }

/** The rows a legend shows: its items that are not hidden, under the names its participants gave them. */
export function legendRows(items: readonly LegendItem[], settings: LegendSettings): LegendRow[] {
  const hidden = new Set(settings.hidden)
  const shown = items.filter((item) => !hidden.has(item.key))
  if (shown.length === 0) return [{ type: 'empty', key: null, label: m.empty, cellId: null, ratio: 1 }]
  const rows: LegendRow[] = shown.slice(0, MAX_LEGEND_ROWS).map((item) => ({
    type: item.type,
    key: item.key,
    label: settings.names[item.key] ?? item.name,
    cellId: item.cellId,
    ratio: item.ratio,
  }))
  if (shown.length > MAX_LEGEND_ROWS) {
    rows.push({ type: 'more', key: null, label: m.more(shown.length - MAX_LEGEND_ROWS), cellId: null, ratio: 1 })
  }
  return rows
}

/** Room around the content of a legend, and between its columns. */
export const LEGEND_PADDING = 10
/** The room of a sample in a row. */
export const LEGEND_SAMPLE = { width: 44, height: 22 }
/** The least width of a legend. */
export const LEGEND_MIN_WIDTH = 160
/** Room above the title, which the label of a legend keeps with `spacingTop`. */
export const LEGEND_TITLE_TOP = 8

/**
 * What a legend looks like unless its participants chose otherwise: a white frame with a grey border and its title in
 * bold at the top left. The canvas puts it under the style of the cell, a file of draw.io writes it.
 */
export const LEGEND_DEFAULTS = {
  fillColor: DEFAULT_FILL_COLOR,
  strokeColor: '#8c959f',
  fontStyle: 1,
  align: 'left',
  verticalAlign: 'top',
  spacing: 0,
  spacingLeft: LEGEND_PADDING,
  spacingRight: LEGEND_PADDING,
  spacingTop: LEGEND_TITLE_TOP,
} as const

/** A row of a legend laid out: its top and height in the legend. */
export interface LegendRowLayout {
  row: LegendRow
  y: number
  height: number
}

export interface LegendLayout {
  width: number
  height: number
  /** The height of the title, under which the line runs. */
  header: number
  rows: LegendRowLayout[]
  /** Where the names start. */
  textX: number
}

/**
 * Lays a legend out: the title in bold, a line under it, then the rows — the sample left, the name after it, at least
 * as high as a sample — and the width of the longest of the title and the names, not less than
 * {@link LEGEND_MIN_WIDTH}. `measure` tells the width of a text in a font, 0 where nothing measures.
 */
export function layoutLegend(
  title: string,
  rows: readonly LegendRow[],
  style: LabelStyle,
  measure: (text: string, style: LabelStyle) => number,
): LegendLayout {
  const fontSize = numeric(style.fontSize, DEFAULT_FONT_SIZE)
  const line = Math.ceil(fontSize * LINE_HEIGHT)
  const header = LEGEND_TITLE_TOP + line + LEGEND_TITLE_TOP
  const rowHeight = Math.max(LEGEND_SAMPLE.height, line) + 8
  const titleFont = { ...style, fontStyle: numeric(style.fontStyle, 1) }
  const textFont = { ...style, fontStyle: 0 }
  const textX = LEGEND_PADDING + LEGEND_SAMPLE.width + LEGEND_PADDING
  let width = Math.max(LEGEND_MIN_WIDTH, 2 * LEGEND_PADDING + measure(title.split('\n')[0] ?? '', titleFont))
  const laid = rows.map((row, index) => {
    const x = row.type === 'shape' || row.type === 'edge' ? textX : LEGEND_PADDING
    width = Math.max(width, x + measure(row.label, textFont) + LEGEND_PADDING)
    return { row, y: header + index * rowHeight, height: rowHeight }
  })
  return { width: Math.ceil(width), height: header + rows.length * rowHeight + LEGEND_PADDING / 2, header, rows: laid, textX }
}

/** The box of the sample of a shape of a row at `top`, as wide and high as the shape of the palette is. */
export function sampleBox(ratio: number, top: number, rowHeight: number) {
  const room = LEGEND_SAMPLE
  const width = ratio >= room.width / room.height ? room.width : room.height * ratio
  const height = ratio >= room.width / room.height ? room.width / ratio : room.height
  return { x: LEGEND_PADDING + (room.width - width) / 2, y: top + (rowHeight - height) / 2, width, height }
}

/** The points of the sample of an edge of a row at `top`: across the room of a sample, in the middle of the row. */
export function sampleLine(top: number, rowHeight: number) {
  const y = top + rowHeight / 2
  return { x1: LEGEND_PADDING, x2: LEGEND_PADDING + LEGEND_SAMPLE.width, y }
}

/** Equal layouts draw the same: a change of the page that changes no row need not draw the legend again. */
export function sameLegendLayout(a: LegendLayout | undefined, b: LegendLayout): boolean {
  if (!a || a.width !== b.width || a.height !== b.height || a.rows.length !== b.rows.length) return false
  return a.rows.every(
    ({ row }, index) =>
      row.key === b.rows[index]!.row.key && row.label === b.rows[index]!.row.label && row.cellId === b.rows[index]!.row.cellId,
  )
}
