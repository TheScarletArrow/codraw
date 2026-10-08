import { generateNKeysBetween } from 'fractional-indexing'
import {
  edgePropertiesStyle,
  normalizeProperties,
  propertiesStyle,
  SHOW_TECHNOLOGY_KEY,
  type ElementProperties,
  type Interaction,
} from '../diagram/elementKinds.ts'
import { composeLabel } from '../diagram/elementProps.ts'
import { newId } from '../diagram/ids.ts'
import { ELEMENT_KEY, LAYER_CELL_ID, type CellData, type StyleValue } from '../diagram/model.ts'
import {
  findShape,
  markedStyle,
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_STYLE,
  TABLE_HEADER_HEIGHT,
  TABLE_INDEX_GAP,
  TABLE_INDEX_KEY,
  type ShapeId,
  type ShapeStyle,
} from '../diagram/shapes.ts'

export interface ShapeOptions {
  /** The label; without it, the label made of `element`, or the label of the shape of the palette. */
  value?: string
  width?: number
  height?: number
  /** Keys added to the style of the shape of the palette. */
  style?: ShapeStyle
  /** Properties of the element of the shape: the shape gets an element of its own with them (see `elementProps.ts`). */
  element?: Partial<ElementProperties>
  /** The plain label shows the technology of the element on its second line. */
  showTechnology?: boolean
}

/** A side of a shape that an edge leaves or enters. */
export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface EdgeOptions {
  value?: string
  style?: Record<string, StyleValue>
  /** The technology or protocol of the edge. */
  technology?: string
  /** A synchronous call or an asynchronous message. */
  interaction?: Interaction
  /** The side of the source the edge leaves, and of the target it enters: otherwise the router picks them. */
  from?: Side
  to?: Side
}

/** Where on a shape the middle of a side is, as draw.io writes the ends of edges. */
const SIDES: Record<Side, [number, number]> = { left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1] }

/**
 * Builds the cells of a diagram from the shapes of the palette, so that a template looks like what a participant
 * would add. Every build gets new ids; cells are drawn in the order they are added, frames first if added first.
 */
export class DiagramBuilder {
  private readonly cells: CellData[] = []

  /** Adds a shape of the palette with its top-left corner at (x, y) and returns its id. */
  shape(preset: ShapeId, x: number, y: number, { value, width, height, style, element, showTechnology = false }: ShapeOptions = {}): string {
    const shape = findShape(preset)
    if (!shape) throw new Error(`No shape ${preset}`)
    const full = { ...markedStyle(shape), ...style } as Record<string, StyleValue>
    if (element) {
      const properties = normalizeProperties({ kind: preset, ...element })
      for (const [key, property] of Object.entries(propertiesStyle(properties))) if (property !== undefined) full[key] = property
      full[ELEMENT_KEY] = newId()
      if (showTechnology) full[SHOW_TECHNOLOGY_KEY] = true
      value ??= composeLabel(properties, full, { showTechnology })
    }
    return this.add({
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      value: value ?? shape.value,
      geometry: { x, y, width: width ?? shape.width, height: height ?? shape.height },
      style: full,
    })
  }

  /**
   * Adds a table of a database with its fields under the name and the rows of its indexes under the fields, with the keys
   * of `style` added to its own, e.g. those of a view; returns the ids of the table and of its fields.
   */
  table(
    name: string,
    x: number,
    y: number,
    fields: string[],
    width = 220,
    indexes: string[] = [],
    style: ShapeStyle = {},
  ): { id: string; fields: string[]; indexes: string[] } {
    const indexesTop = TABLE_HEADER_HEIGHT + fields.length * TABLE_FIELD_HEIGHT + TABLE_INDEX_GAP
    const id = this.shape('table', x, y, {
      value: name,
      width,
      height: indexes.length > 0 ? indexesTop + indexes.length * TABLE_FIELD_HEIGHT : TABLE_HEADER_HEIGHT + fields.length * TABLE_FIELD_HEIGHT,
      style,
    })
    const row = (value: string, top: number, style: Record<string, StyleValue>) =>
      this.add({
        kind: 'vertex',
        parent: id,
        value,
        geometry: { x: 0, y: top, width, height: TABLE_FIELD_HEIGHT },
        style: { ...TABLE_FIELD_STYLE, ...style } as Record<string, StyleValue>,
      })
    const fieldIds = fields.map((field, index) => row(field, TABLE_HEADER_HEIGHT + index * TABLE_FIELD_HEIGHT, {}))
    const indexIds = indexes.map((index, at) => row(index, indexesTop + at * TABLE_FIELD_HEIGHT, { [TABLE_INDEX_KEY]: true }))
    return { id, fields: fieldIds, indexes: indexIds }
  }

  /** Adds an edge from `source` to `target` with the default look of CoDraw and the keys of `style`. */
  edge(source: string, target: string, { value = '', style = {}, from, to, technology = '', interaction }: EdgeOptions = {}): string {
    const ends: Record<string, StyleValue> = {
      ...(from && { exitX: SIDES[from][0], exitY: SIDES[from][1] }),
      ...(to && { entryX: SIDES[to][0], entryY: SIDES[to][1] }),
    }
    for (const [key, property] of Object.entries(edgePropertiesStyle({ technology, interaction: interaction ?? null }))) {
      if (property !== undefined) ends[key] = property
    }
    return this.add({
      kind: 'edge',
      parent: LAYER_CELL_ID,
      value,
      geometry: { x: 0, y: 0, width: 0, height: 0, relative: true },
      source,
      target,
      style: { ...ends, ...style },
    })
  }

  /** The cells, each ordered among its siblings in the order it was added. */
  build(): CellData[] {
    const siblings = new Map<string, CellData[]>()
    for (const cell of this.cells) siblings.set(cell.parent!, [...(siblings.get(cell.parent!) ?? []), cell])
    siblings.forEach((group) => {
      const keys = generateNKeysBetween(null, null, group.length)
      group.forEach((cell, index) => (cell.order = keys[index]!))
    })
    return this.cells.map((cell) => ({ ...cell }))
  }

  private add(cell: Omit<CellData, 'id' | 'order' | 'source' | 'target'> & Partial<Pick<CellData, 'source' | 'target'>>) {
    const id = newId()
    this.cells.push({ source: null, target: null, ...cell, id, order: '' })
    return id
  }
}
