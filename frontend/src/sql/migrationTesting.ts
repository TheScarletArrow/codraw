import type { BoardSnapshot, CellSnapshot } from '../diagram/diff.ts'
import { LAYER_CELL_ID, type CellData, type StyleValue } from '../diagram/model.ts'
import { TABLE_INDEX_KEY } from '../diagram/shapes.ts'
import type { DbVendorId } from './dbVendors.ts'
import { DIALECTS } from './dialects.ts'
import { boardSchema, planMigration } from './migration.ts'
import { migrationBody } from './migrationFiles.ts'

/** States of boards with tables for the tests of migrations. */

/** A table of a page: fields and indexes by the ids of their rows, `<table>.<id>` and `<table>#<id>`. */
export function table(
  id: string,
  name: string,
  fields: Record<string, string>,
  {
    indexes = {},
    order = 'a0',
    style = {},
    rowStyle = {},
  }: {
    indexes?: Record<string, string>
    order?: string
    style?: Record<string, StyleValue>
    rowStyle?: Record<string, Record<string, StyleValue>>
  } = {},
): CellData[] {
  const row = (rowId: string, value: string, at: number, extra: Record<string, StyleValue>): CellData => ({
    id: rowId,
    kind: 'vertex',
    parent: id,
    order: `a${at}`,
    value,
    geometry: { x: 0, y: 30 + 26 * at, width: 200, height: 26 },
    source: null,
    target: null,
    style: { ...extra, ...rowStyle[rowId] },
  })
  return [
    {
      id,
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      order,
      value: name,
      geometry: { x: 0, y: 0, width: 200, height: 100 },
      source: null,
      target: null,
      style: { childLayout: 'stackLayout', dbVendor: 'postgresql', ...style },
    },
    ...Object.entries(fields).map(([field, value], at) => row(`${id}.${field}`, value, at, {})),
    ...Object.entries(indexes).map(([index, value], at) => row(`${id}#${index}`, value, 10 + at, { [TABLE_INDEX_KEY]: true })),
  ]
}

/** An edge between two fields, from `source` to `target`. */
export const edge = (id: string, source: string, target: string): CellData => ({
  id,
  kind: 'edge',
  parent: LAYER_CELL_ID,
  order: 'z0',
  value: '',
  geometry: { x: 0, y: 0, width: 0, height: 0, relative: true },
  source,
  target,
  style: {},
})

export interface PageCells {
  id: string
  name: string
  order: string
  cells: CellData[]
}

const snapshotCell = (cell: CellData): CellSnapshot => ({ ...cell, attrs: {}, extra: {} })

/** A state of a board with the pages and their cells. */
export function boardOf(...pages: PageCells[]): BoardSnapshot {
  return new Map(
    pages.map((page) => [
      page.id,
      {
        id: page.id,
        name: page.name,
        order: page.order,
        cells: new Map(page.cells.map((cell) => [cell.id, snapshotCell(cell)])),
      },
    ]),
  )
}

/** A state of a board of one page with these cells. */
export const state = (...cells: CellData[][]) => boardOf({ id: 'page-1', name: 'Страница 1', order: 'a0', cells: cells.flat() })

/** The statements of the migration from `before` to `after`. */
export function migrate(before: BoardSnapshot, after: BoardSnapshot, vendor: DbVendorId = 'postgresql'): string {
  return migrationBody(planMigration(boardSchema(before), boardSchema(after), DIALECTS[vendor]))
}

export const plan = (before: BoardSnapshot, after: BoardSnapshot, vendor: DbVendorId = 'postgresql') =>
  planMigration(boardSchema(before), boardSchema(after), DIALECTS[vendor])
