import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'

/**
 * Board document model in Yjs. It mirrors the mxGraph cell model (and so the `.drawio` format):
 *
 * - `meta`: `{ schemaVersion }`
 * - `pages`: pageId → Y.Map with the fields of {@link PageData}
 * - `cells:<pageId>`: cellId → Y.Map with the fields of {@link CellData}; `style` is a nested Y.Map. The root `0` holds
 *   the layers of the page (`kind: 'layer'`: the main layer `1`, which every page has, and those added since), and they
 *   hold the elements; a layer keeps its name as its value and its lock and visibility as keys of its style
 * - `elements`: elementId → Y.Map with the fields of {@link ElementData}: the properties of an element of the
 *   architecture, which the cell that shows it names with {@link ELEMENT_KEY}
 *
 * Cells of a page live in a top-level map rather than inside the page entry: top-level types never
 * conflict, so two clients that initialize a fresh document at the same time cannot lose cells.
 *
 * Version 2 made page entries Y.Maps (they were plain objects): renaming and moving a page change
 * different keys, so concurrent changes of one page merge.
 *
 * Elements live apart from cells so that one element may later be shown by cells of several pages. To everything but
 * the document, the properties of the element of a cell are keys of its style ({@link ELEMENT_STYLE_KEYS}):
 * {@link readCell} adds them to the style, and {@link writeCell} writes them into the element. The model of maxGraph,
 * copies, files and versions carry them with the cell that way.
 */

export const SCHEMA_VERSION = 2
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
  /** The element this page details (see `detail.ts`): its cell on the page it was detailed from, and the element. */
  detailOf?: DetailOf
}

/** The element a page of detail is about. */
export interface DetailOf {
  pageId: string
  cellId: string
  elementId: string
}

/** The element a page names as the one it details, from a value of the document; `undefined` for anything else. */
function readDetailOf(value: unknown): DetailOf | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { pageId, cellId, elementId } = value as Record<string, unknown>
  return typeof pageId === 'string' && typeof cellId === 'string' && typeof elementId === 'string' ? { pageId, cellId, elementId } : undefined
}

export type CellMap = Y.Map<unknown>
export type CellsMap = Y.Map<CellMap>
export type PageMap = Y.Map<unknown>
/** A page entry; plain objects are version 1 entries that {@link initializeDocument} has not migrated yet. */
export type PageEntry = PageMap | PageData

export const DEFAULT_PAGE_NAME = 'Страница 1'

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta')
}

export function getPages(doc: Y.Doc): Y.Map<PageEntry> {
  return doc.getMap('pages')
}

export function getCells(doc: Y.Doc, pageId = DEFAULT_PAGE_ID): CellsMap {
  return doc.getMap(`cells:${pageId}`)
}

/** Style key of a cell that names the element whose properties the cell shows. */
export const ELEMENT_KEY = 'codrawElement'

/**
 * Style key of a cell with the lines of its own of its plain label, kept aside while its element is of a kind of C4,
 * whose label has no lines of its own, and given back when it is not any longer. A file does not carry it.
 */
export const OWN_LINES_KEY = 'codrawOwnLines'

/**
 * The properties of an element of the architecture as the document keeps them; an empty property has no key. `kind` is
 * a shape of the palette, `tags` are words.
 */
export interface ElementData {
  name?: string
  kind?: string
  technology?: string
  description?: string
  owner?: string
  tags?: string[]
}

export type ElementField = keyof ElementData

/** The style keys under which the editor, copies, files and versions see the properties of the element of a cell. */
export const ELEMENT_STYLE_KEYS: Readonly<Record<ElementField, string>> = {
  name: 'codrawName',
  kind: 'codrawKind',
  technology: 'codrawTechnology',
  description: 'codrawDescription',
  owner: 'codrawOwner',
  tags: 'codrawTags',
}

const ELEMENT_FIELDS = Object.keys(ELEMENT_STYLE_KEYS) as ElementField[]
const ELEMENT_STYLE_KEY_SET: ReadonlySet<string> = new Set(Object.values(ELEMENT_STYLE_KEYS))

/** A style key that holds a property of an element. */
export const isElementStyleKey = (key: string) => ELEMENT_STYLE_KEY_SET.has(key)

export type ElementMap = Y.Map<unknown>

export function getElements(doc: Y.Doc): Y.Map<ElementMap> {
  return doc.getMap('elements')
}

/** The element a style names; `null` without one. */
export function elementIdOf(style: Record<string, unknown> | null | undefined): string | null {
  const id = style?.[ELEMENT_KEY]
  return typeof id === 'string' && id !== '' ? id : null
}

/** The element the cell of the document names; `null` without one. */
export function cellElementId(cell: CellMap | undefined): string | null {
  const style = cell?.get('style')
  const id = style instanceof Y.Map ? style.get(ELEMENT_KEY) : undefined
  return typeof id === 'string' && id !== '' ? id : null
}

/** A property as the document keeps it: a non-empty string, or for tags a non-empty list of strings; otherwise none. */
function elementValue(field: ElementField, value: unknown): string | string[] | undefined {
  if (field === 'tags') {
    if (!Array.isArray(value)) return undefined
    const tags = value.filter((tag): tag is string => typeof tag === 'string' && tag !== '')
    return tags.length > 0 ? tags : undefined
  }
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * The style of a cell of `doc` with the properties of the element it names as style keys, in place of any such keys of
 * the style itself; the style as it is when it names no element or the document has no such element.
 */
export function withElementProperties(doc: Y.Doc | null, style: Record<string, StyleValue>): Record<string, StyleValue> {
  const id = elementIdOf(style)
  const element = doc && id ? getElements(doc).get(id) : undefined
  if (!(element instanceof Y.Map)) return style
  const joined: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(style)) if (!isElementStyleKey(key)) joined[key] = value
  for (const field of ELEMENT_FIELDS) {
    const value = elementValue(field, element.get(field))
    if (value !== undefined) joined[ELEMENT_STYLE_KEYS[field]] = Array.isArray(value) ? [...value] : value
  }
  return joined
}

/**
 * Writes the properties that `style` holds as style keys into the element `id`, creating it, key by key: the others
 * stay, so concurrent changes of different properties merge; a property the style lacks is removed. Returns the style
 * keys of the properties that changed.
 */
function writeElement(doc: Y.Doc, id: string, style: Record<string, StyleValue>): string[] {
  const elements = getElements(doc)
  let element = elements.get(id)
  if (!(element instanceof Y.Map)) {
    element = new Y.Map()
    elements.set(id, element)
  }
  const changed: string[] = []
  for (const field of ELEMENT_FIELDS) {
    const key = ELEMENT_STYLE_KEYS[field]
    const value = elementValue(field, style[key])
    if (value === undefined) {
      if (element.has(field)) {
        element.delete(field)
        changed.push(key)
      }
    } else if (setIfChanged(element, field, value)) {
      changed.push(key)
    }
  }
  return changed
}

/**
 * Removes the elements among `ids` that no cell of any page names any longer, e.g. after their cells were deleted. Call
 * inside a transaction, after the cells changed.
 */
export function dropUnusedElements(doc: Y.Doc, ids: Iterable<string | null>) {
  const elements = getElements(doc)
  const unused = new Set<string>()
  for (const id of ids) if (id !== null && elements.has(id)) unused.add(id)
  if (unused.size === 0) return
  for (const pageId of getPages(doc).keys()) {
    for (const cell of getCells(doc, pageId).values()) {
      const id = cell instanceof Y.Map ? cellElementId(cell) : null
      if (id !== null) unused.delete(id)
      if (unused.size === 0) return
    }
  }
  unused.forEach((id) => elements.delete(id))
}

/**
 * Style key of a layer hidden for everybody by default: `visible="0"` of the layer in a file of draw.io. A participant
 * may still show it on their own canvas (see `layerViews.ts`).
 */
export const HIDDEN_LAYER_KEY = 'codrawHidden'

/** The name of the main layer of a page, the layer `1`, while it has no name of its own. */
export const MAIN_LAYER_NAME = 'Основной слой'

/** The name of another layer without a name of its own, e.g. of a file of draw.io. */
export const UNNAMED_LAYER_NAME = 'Слой без имени'

/** The style hides its layer for everybody: CoDraw keeps `true`. */
export function isHiddenLayerStyle(style: Record<string, unknown> | null | undefined): boolean {
  const value = style?.[HIDDEN_LAYER_KEY]
  return value === true || value === 1 || value === '1'
}

/** The name a layer goes by: its own, or that of the main layer or of a layer without a name. */
export function layerName(id: string, value: unknown): string {
  const own = typeof value === 'string' ? value.trim() : ''
  return own || (id === LAYER_CELL_ID ? MAIN_LAYER_NAME : UNNAMED_LAYER_NAME)
}

/**
 * The ids of the layers among `cells`, and always the main layer: a cell whose parent is one of them is an element of
 * the page itself, not of a table, a group or another element.
 */
export function layerIds(cells: Iterable<Pick<CellData, 'id' | 'kind'>>): Set<string> {
  const ids = new Set([LAYER_CELL_ID])
  for (const cell of cells) if (cell.kind === 'layer') ids.add(cell.id)
  return ids
}

export function readPage(entry: PageEntry): PageData {
  if (entry instanceof Y.Map) {
    const detailOf = readDetailOf(entry.get('detailOf'))
    return {
      name: String(entry.get('name') ?? ''),
      order: (entry.get('order') as string | undefined) ?? generateKeyBetween(null, null),
      ...(detailOf && { detailOf }),
    }
  }
  return { name: String(entry.name ?? ''), order: entry.order ?? generateKeyBetween(null, null) }
}

/** Creates the entry of a page and the root and layer cells of the page. Call inside a transaction. */
export function writePage(doc: Y.Doc, id: string, page: PageData) {
  const entry = new Y.Map<unknown>()
  entry.set('name', page.name)
  entry.set('order', page.order)
  if (page.detailOf) entry.set('detailOf', { ...page.detailOf })
  getPages(doc).set(id, entry)
  writeStructuralCells(getCells(doc, id))
}

function writeStructuralCells(cells: CellsMap) {
  if (!cells.has(ROOT_CELL_ID)) writeCell(cells, emptyCell(ROOT_CELL_ID, 'root', null))
  if (!cells.has(LAYER_CELL_ID)) writeCell(cells, emptyCell(LAYER_CELL_ID, 'layer', ROOT_CELL_ID))
}

/**
 * Adds whatever is missing for a board: schema version, the default page with its root and layer cells when
 * the board has no pages, and Y.Map entries in place of version 1 page entries. Fixed ids make concurrent
 * initialization by several clients converge; concurrent migrations write equal entries.
 */
export function initializeDocument(doc: Y.Doc) {
  const meta = getMeta(doc)
  const pages = getPages(doc)
  const version = meta.get('schemaVersion')
  const outdated = Array.from(pages.entries()).filter(([, entry]) => !(entry instanceof Y.Map))
  const missing =
    pages.size === 0 ||
    typeof version !== 'number' ||
    version < SCHEMA_VERSION ||
    outdated.length > 0 ||
    Array.from(pages.keys()).some((id) => {
      const cells = getCells(doc, id)
      return !cells.has(ROOT_CELL_ID) || !cells.has(LAYER_CELL_ID)
    })
  if (!missing) return

  doc.transact(() => {
    if (typeof version !== 'number' || version < SCHEMA_VERSION) meta.set('schemaVersion', SCHEMA_VERSION)
    for (const [id, entry] of outdated) writePage(doc, id, readPage(entry))
    if (pages.size === 0) writePage(doc, DEFAULT_PAGE_ID, { name: DEFAULT_PAGE_NAME, order: generateKeyBetween(null, null) })
    for (const id of pages.keys()) writeStructuralCells(getCells(doc, id))
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

/** Reads a cell of the document; the style has the properties of the element of the cell, see {@link withElementProperties}. */
export function readCell(id: string, cell: CellMap): CellData {
  const style = cell.get('style')
  const own = style instanceof Y.Map ? (style.toJSON() as Record<string, StyleValue>) : {}
  return {
    id,
    kind: cell.get('kind') as CellKind,
    parent: (cell.get('parent') as string | null | undefined) ?? null,
    order: (cell.get('order') as string | undefined) ?? generateKeyBetween(null, null),
    value: (cell.get('value') as string | undefined) ?? '',
    geometry: (cell.get('geometry') as GeometryData | null | undefined) ?? null,
    source: (cell.get('source') as string | null | undefined) ?? null,
    target: (cell.get('target') as string | null | undefined) ?? null,
    style: withElementProperties(cell.doc, own),
  }
}

/** What {@link writeCell} changed in the document. */
export interface CellWrite {
  /** The cell was not in the document. */
  created: boolean
  /** Fields of the cell that changed, the keys of its style aside. */
  fields: (keyof CellData)[]
  /** Keys of the style that were set, changed or removed. */
  style: string[]
}

/** Fields of a cell that {@link writeCell} writes as they are; the style is written key by key. */
const PLAIN_FIELDS = ['kind', 'parent', 'order', 'value', 'geometry', 'source', 'target'] as const

/**
 * Creates or updates a cell, writing only the fields that differ from the stored ones. Untouched
 * fields stay as they are, so concurrent edits of different fields by different clients merge.
 * The properties of the element that the style names go into that element, not into the style of the cell.
 * Returns what it changed: nothing when the stored cell was equal already.
 */
export function writeCell(cells: CellsMap, data: CellData): CellWrite {
  const doc = cells.doc
  const elementId = doc ? elementIdOf(data.style) : null
  let cell = cells.get(data.id)
  const write: CellWrite = { created: !cell, fields: [], style: [] }
  if (!cell) {
    cell = new Y.Map()
    cells.set(data.id, cell)
  }
  for (const field of PLAIN_FIELDS) {
    if (setIfChanged(cell, field, data[field])) write.fields.push(field)
  }

  let style = cell.get('style')
  if (!(style instanceof Y.Map)) {
    style = new Y.Map()
    cell.set('style', style)
    write.fields.push('style')
  }
  const styleMap = style as Y.Map<StyleValue>
  // A cell of an element keeps none of its properties in its style.
  const own = (key: string) => data.style[key] !== undefined && !(elementId !== null && isElementStyleKey(key))
  for (const [key, value] of Object.entries(data.style)) {
    if (!own(key)) continue
    if (setIfChanged(styleMap, key, value)) write.style.push(key)
  }
  for (const key of Array.from(styleMap.keys())) {
    if (!own(key)) {
      styleMap.delete(key)
      write.style.push(key)
    }
  }
  if (elementId !== null) {
    for (const key of writeElement(doc!, elementId, data.style)) if (!write.style.includes(key)) write.style.push(key)
  }
  return write
}

/** Sets the key unless it holds an equal value already; returns whether it did. */
function setIfChanged<T>(map: Y.Map<T>, key: string, value: T): boolean {
  if (sameValue(map.get(key), value)) return false
  map.set(key, value)
  return true
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

/** Custom properties of a cell (attributes of `<object>` in `.drawio`); the editor does not use them. */
export function readAttrs(cell: CellMap): Record<string, string> {
  const attrs = cell.get('attrs')
  return attrs instanceof Y.Map ? (attrs.toJSON() as Record<string, string>) : {}
}

/** Sets the custom properties of a cell; an empty set removes them. */
export function writeAttrs(cell: CellMap, attrs: Record<string, string>) {
  if (Object.keys(attrs).length === 0) {
    cell.delete('attrs')
    return
  }
  const map = new Y.Map<string>()
  for (const [key, value] of Object.entries(attrs)) map.set(key, value)
  cell.set('attrs', map)
}
