import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'

/**
 * Board document model in Yjs. It mirrors the mxGraph cell model (and so the `.drawio` format):
 *
 * - `meta`: `{ schemaVersion }`
 * - `pages`: pageId → `{ name, order }`
 * - `cells:<pageId>`: cellId → Y.Map with the fields of {@link CellData}; `style` is a nested Y.Map
 *
 * Cells of a page live in a top-level map rather than inside the page entry: top-level types never
 * conflict, so two clients that initialize a fresh document at the same time cannot lose cells.
 */

export const SCHEMA_VERSION = 1
export const DEFAULT_PAGE_ID = 'page-1'
export const ROOT_CELL_ID = '0'
export const LAYER_CELL_ID = '1'

/** Transaction origin for document initialization; it is never undoable. */
export const INIT_ORIGIN = 'codraw:init'

export type CellKind = 'root' | 'layer' | 'vertex' | 'edge'

export interface PointData {
  x: number
  y: number
}

export interface GeometryData {
  x: number
  y: number
  width: number
  height: number
  relative?: boolean
  /** Waypoints of an edge. */
  points?: PointData[]
  /** Label offset. */
  offset?: PointData
  /** Ends of an edge that is not connected to a cell. */
  sourcePoint?: PointData
  targetPoint?: PointData
}

export type StyleValue = string | number | boolean | string[]

export interface CellData {
  id: string
  kind: CellKind
  parent: string | null
  /** Fractional index that orders the cell among its siblings. */
  order: string
  value: string
  geometry: GeometryData | null
  source: string | null
  target: string | null
  style: Record<string, StyleValue>
}

export interface PageData {
  name: string
  order: string
}

export type CellMap = Y.Map<unknown>
export type CellsMap = Y.Map<CellMap>

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta')
}

export function getPages(doc: Y.Doc): Y.Map<PageData> {
  return doc.getMap('pages')
}

export function getCells(doc: Y.Doc, pageId = DEFAULT_PAGE_ID): CellsMap {
  return doc.getMap(`cells:${pageId}`)
}

/**
 * Adds whatever is missing for an empty board: schema version, the default page and its root and
 * layer cells. Fixed ids make concurrent initialization by several clients converge.
 */
export function initializeDocument(doc: Y.Doc) {
  const meta = getMeta(doc)
  const pages = getPages(doc)
  const cells = getCells(doc)
  const missing =
    !meta.has('schemaVersion') || !pages.has(DEFAULT_PAGE_ID) || !cells.has(ROOT_CELL_ID) || !cells.has(LAYER_CELL_ID)
  if (!missing) return

  doc.transact(() => {
    if (!meta.has('schemaVersion')) meta.set('schemaVersion', SCHEMA_VERSION)
    if (!pages.has(DEFAULT_PAGE_ID)) pages.set(DEFAULT_PAGE_ID, { name: 'Страница 1', order: generateKeyBetween(null, null) })
    if (!cells.has(ROOT_CELL_ID)) writeCell(cells, emptyCell(ROOT_CELL_ID, 'root', null))
    if (!cells.has(LAYER_CELL_ID)) writeCell(cells, emptyCell(LAYER_CELL_ID, 'layer', ROOT_CELL_ID))
  }, INIT_ORIGIN)
}

function emptyCell(id: string, kind: CellKind, parent: string | null): CellData {
  return {
    id,
    kind,
    parent,
    order: generateKeyBetween(null, null),
    value: '',
    geometry: null,
    source: null,
    target: null,
    style: {},
  }
}

export function readCell(id: string, cell: CellMap): CellData {
  const style = cell.get('style')
  return {
    id,
    kind: cell.get('kind') as CellKind,
    parent: (cell.get('parent') as string | null | undefined) ?? null,
    order: (cell.get('order') as string | undefined) ?? generateKeyBetween(null, null),
    value: (cell.get('value') as string | undefined) ?? '',
    geometry: (cell.get('geometry') as GeometryData | null | undefined) ?? null,
    source: (cell.get('source') as string | null | undefined) ?? null,
    target: (cell.get('target') as string | null | undefined) ?? null,
    style: style instanceof Y.Map ? (style.toJSON() as Record<string, StyleValue>) : {},
  }
}

/**
 * Creates or updates a cell, writing only the fields that differ from the stored ones. Untouched
 * fields stay as they are, so concurrent edits of different fields by different clients merge.
 */
export function writeCell(cells: CellsMap, data: CellData) {
  let cell = cells.get(data.id)
  if (!cell) {
    cell = new Y.Map()
    cells.set(data.id, cell)
  }
  setIfChanged(cell, 'kind', data.kind)
  setIfChanged(cell, 'parent', data.parent)
  setIfChanged(cell, 'order', data.order)
  setIfChanged(cell, 'value', data.value)
  setIfChanged(cell, 'geometry', data.geometry)
  setIfChanged(cell, 'source', data.source)
  setIfChanged(cell, 'target', data.target)

  let style = cell.get('style')
  if (!(style instanceof Y.Map)) {
    style = new Y.Map()
    cell.set('style', style)
  }
  const styleMap = style as Y.Map<StyleValue>
  for (const [key, value] of Object.entries(data.style)) {
    if (value === undefined) continue
    setIfChanged(styleMap, key, value)
  }
  for (const key of Array.from(styleMap.keys())) {
    if (data.style[key] === undefined) styleMap.delete(key)
  }
}

function setIfChanged<T>(map: Y.Map<T>, key: string, value: T) {
  if (!sameValue(map.get(key), value)) {
    map.set(key, value)
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return a === b || (a ?? null) === (b ?? null)
  return JSON.stringify(a) === JSON.stringify(b)
}

export function deleteCell(cells: CellsMap, id: string) {
  cells.delete(id)
}

/** Returns an order key that sorts between `before` and `after`; `null` means the start or the end. */
export function orderBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

/** Sort order of siblings: by order key, then by id, so that equal keys from concurrent inserts are stable. */
export function compareCells(a: Pick<CellData, 'order' | 'id'>, b: Pick<CellData, 'order' | 'id'>): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
