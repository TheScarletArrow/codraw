import { generateNKeysBetween } from 'fractional-indexing'
import { newId } from '../diagram/ids.ts'
import { LAYER_CELL_ID, type CellData, type StyleValue } from '../diagram/model.ts'
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
  value?: string
  width?: number
  height?: number
  /** Keys added to the style of the shape of the palette. */
  style?: ShapeStyle
}

/** A side of a shape that an edge leaves or enters. */
export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface EdgeOptions {
  value?: string
  style?: Record<string, StyleValue>
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
  shape(preset: ShapeId, x: number, y: number, { value, width, height, style }: ShapeOptions = {}): string {
    const shape = findShape(preset)
    if (!shape) throw new Error(`No shape ${preset}`)
    return this.add({
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      value: value ?? shape.value,
      geometry: { x, y, width: width ?? shape.width, height: height ?? shape.height },
      style: { ...markedStyle(shape), ...style } as Record<string, StyleValue>,
    })
  }

  /**
   * Adds a table of a database with its fields under the name and the rows of its indexes under the fields; returns the
   * ids of the table and of its fields.
   */
  table(name: string, x: number, y: number, fields: string[], width = 220, indexes: string[] = []): { id: string; fields: string[] } {
    const indexesTop = TABLE_HEADER_HEIGHT + fields.length * TABLE_FIELD_HEIGHT + TABLE_INDEX_GAP
    const id = this.shape('table', x, y, {
      value: name,
      width,
      height: indexes.length > 0 ? indexesTop + indexes.length * TABLE_FIELD_HEIGHT : TABLE_HEADER_HEIGHT + fields.length * TABLE_FIELD_HEIGHT,
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
    indexes.forEach((index, at) => row(index, indexesTop + at * TABLE_FIELD_HEIGHT, { [TABLE_INDEX_KEY]: true }))
    return { id, fields: fieldIds }
  }

  /** Adds an edge from `source` to `target` with the default look of CoDraw and the keys of `style`. */
  edge(source: string, target: string, { value = '', style = {}, from, to }: EdgeOptions = {}): string {
    const ends: Record<string, StyleValue> = {
      ...(from && { exitX: SIDES[from][0], exitY: SIDES[from][1] }),
      ...(to && { entryX: SIDES[to][0], entryY: SIDES[to][1] }),
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
