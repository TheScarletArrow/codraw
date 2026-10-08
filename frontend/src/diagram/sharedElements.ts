import * as Y from 'yjs'
import type { ElementProperties } from './elementKinds.ts'
import { canBeElement, elementProperties, labelText, relabel, showsTechnology } from './elementProps.ts'
import { newId } from './ids.ts'
import { isLockedStyle } from './locks.ts'
import {
  cellElementId,
  dropUnusedElements,
  ELEMENT_KEY,
  ELEMENT_STYLE_KEYS,
  getCells,
  getElements,
  isElementStyleKey,
  readCell,
  writeCell,
  type CellMap,
  type CellsMap,
  type ElementData,
  type ElementField,
  type StyleValue,
} from './model.ts'
import { listPages } from './pages.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'

/**
 * One element of the architecture shown by cells of several pages, or of one page: the cells share the properties of
 * the element (see `model.ts`), and each keeps its place, look, lines of its own, lock, status and link. A change of
 * the properties rewrites the labels of all the cells of the element in the same transaction
 * ({@link relabelElementCells}); labels that two participants changed at the same time are put right afterwards
 * ({@link healLabels}).
 *
 * Everything here works on the document, without a canvas: the editor runs it in a transaction of its page and reads
 * the cells of its page into the canvas again.
 */

/** A cell of a page. */
export interface CellRef {
  pageId: string
  cellId: string
}

/** Origin of the transactions that put labels right; no history undoes them, and they mark nobody as the author. */
export const RELABEL_ORIGIN = 'codraw:relabel'

/** The type of the data of a drag of an element from the panel «Элементы доски» onto the canvas. */
export const ELEMENT_DRAG_TYPE = 'application/x-codraw-element'

/** What a drag from the panel carries: an element, or a shape that is no element yet. */
export type ElementDrag = { elementId: string } | { cell: CellRef }

/** The element of the data of a drag; `null` for anything else. */
export function readElementDrag(data: string): ElementDrag | null {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { elementId, cell } = value as { elementId?: unknown; cell?: { pageId?: unknown; cellId?: unknown } }
  if (typeof elementId === 'string' && elementId !== '') return { elementId }
  if (typeof cell?.pageId === 'string' && typeof cell.cellId === 'string') return { cell: { pageId: cell.pageId, cellId: cell.cellId } }
  return null
}

const ELEMENT_FIELDS = Object.keys(ELEMENT_STYLE_KEYS) as ElementField[]

/** The style of a cell as the document keeps it, without the properties of its element. */
function ownStyle(cell: CellMap): Record<string, StyleValue> {
  const style = cell.get('style')
  return style instanceof Y.Map ? (style.toJSON() as Record<string, StyleValue>) : {}
}

/** The properties of an element as style keys, the way the editor sees them in the style of its cell. */
function propertiesAsStyle(data: ElementData | undefined): Record<string, StyleValue> {
  const style: Record<string, StyleValue> = {}
  if (!data) return style
  for (const field of ELEMENT_FIELDS) {
    const value = data[field]
    if (value !== undefined) style[ELEMENT_STYLE_KEYS[field]] = Array.isArray(value) ? [...value] : value
  }
  return style
}

/** The style of a cell with the properties `data` of its element in place of those it has. */
export function styleWith(own: Record<string, StyleValue>, data: ElementData | undefined): Record<string, StyleValue> {
  const style: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(own)) if (!isElementStyleKey(key)) style[key] = value
  return { ...style, ...propertiesAsStyle(data) }
}

/** The properties of the element `id` as the document keeps them; `undefined` without such an element. */
export function elementData(doc: Y.Doc, id: string): ElementData | undefined {
  const element = getElements(doc).get(id)
  return element instanceof Y.Map ? (element.toJSON() as ElementData) : undefined
}

/**
 * Whether the cell `id` of a page is a shape that may be an element: a vertex that is not inside a table nor the label
 * of an edge, and that {@link canBeElement}.
 */
export function mayBeElement(cells: CellsMap, id: string): boolean {
  const cell = cells.get(id)
  if (!(cell instanceof Y.Map) || cell.get('kind') !== 'vertex') return false
  const parentId = cell.get('parent')
  const parent = typeof parentId === 'string' ? cells.get(parentId) : undefined
  if (parent instanceof Y.Map) {
    if (parent.get('kind') === 'edge') return false
    if (isTableStyle(ownStyle(parent) as ShapeStyle)) return false
  }
  return canBeElement(ownStyle(cell))
}

/** The cells of each element of the board by its id: the pages in their order, those of a page as the page has them. */
export function elementUses(doc: Y.Doc): Map<string, CellRef[]> {
  const uses = new Map<string, CellRef[]>()
  for (const page of listPages(doc)) {
    getCells(doc, page.id).forEach((cell, cellId) => {
      const id = cell instanceof Y.Map ? cellElementId(cell) : null
      if (id === null) return
      const list = uses.get(id)
      if (list) list.push({ pageId: page.id, cellId })
      else uses.set(id, [{ pageId: page.id, cellId }])
    })
  }
  return uses
}

/**
 * The label `value` of a cell with the style `before` once it shows the element `id` with the properties `data`: of
 * them, with the lines of its own and the technology shown as the cell had them.
 */
export function labelWith(before: Record<string, StyleValue>, value: string, id: string, data: ElementData | undefined): string {
  const after = { ...styleWith(before, data), [ELEMENT_KEY]: id }
  return relabel(elementProperties(after, value), before, value, showsTechnology(before, value))
}

/** The label of a cell with the properties of its element now, its own lines and its own showing of the technology. */
function labelNow(own: Record<string, StyleValue>, before: Record<string, StyleValue>, value: string, doc: Y.Doc): string {
  const id = own[ELEMENT_KEY]
  return typeof id === 'string' ? labelWith(before, value, id, elementData(doc, id)) : value
}

/**
 * Rewrites the labels of the cells of all pages that show the elements of `before` after their properties changed:
 * each label of the properties now, with the lines of its own and the technology shown as the cell had them with the
 * properties `before` (`undefined` for an element that did not exist). Cells that `skip` names, e.g. those the change
 * wrote itself, stay. Call inside the transaction of the change; returns the cells whose labels changed.
 */
export function relabelElementCells(
  doc: Y.Doc,
  before: ReadonlyMap<string, ElementData | undefined>,
  skip: (ref: CellRef) => boolean = () => false,
): CellRef[] {
  const changed: CellRef[] = []
  if (before.size === 0) return changed
  for (const page of listPages(doc)) {
    getCells(doc, page.id).forEach((cell, cellId) => {
      const id = cell instanceof Y.Map ? cellElementId(cell) : null
      if (id === null || !before.has(id) || skip({ pageId: page.id, cellId })) return
      const own = ownStyle(cell)
      const value = String(cell.get('value') ?? '')
      const label = labelNow(own, styleWith(own, before.get(id)), value, doc)
      if (label === value) return
      cell.set('value', label)
      changed.push({ pageId: page.id, cellId })
    })
  }
  return changed
}

/**
 * Puts right the labels of the cells of a page (those of `ids`, or all) that do not tell the properties of their
 * elements, e.g. after two participants changed different properties of one element at the same time: the properties
 * merge, the labels do not. A label of HTML, from draw.io, stays as it is: its lines are not lines of text. Returns the
 * ids of the cells it changed.
 */
export function healLabels(cells: CellsMap, ids?: Iterable<string>): string[] {
  const doc = cells.doc
  if (!doc) return []
  const healed: string[] = []
  const elements = getElements(doc)
  for (const cellId of ids ?? cells.keys()) {
    const cell = cells.get(cellId)
    const id = cell instanceof Y.Map ? cellElementId(cell) : null
    if (id === null || !elements.has(id)) continue
    const own = ownStyle(cell!)
    if (own.html === true || own.html === 1 || own.html === '1') continue
    const value = String(cell!.get('value') ?? '')
    const current = styleWith(own, elementData(doc, id))
    const label = labelNow(own, current, value, doc)
    if (label === value || label === labelText(value, own)) continue
    cell!.set('value', label)
    healed.push(cellId)
  }
  return healed
}

/**
 * Makes the shape `ref` a cell of an element, as changing its properties would: its element, or a new one with the
 * properties its label tells; an element that its cell names but the document lost, or that has no properties, gets
 * them. Returns the element, or `null` when the cell is no shape that may be an element. Call inside a transaction.
 */
export function ensureElement(doc: Y.Doc, ref: CellRef): string | null {
  const cells = getCells(doc, ref.pageId)
  const cell = cells.get(ref.cellId)
  if (!(cell instanceof Y.Map) || !mayBeElement(cells, ref.cellId)) return null
  const named = cellElementId(cell)
  const element = named === null ? undefined : getElements(doc).get(named)
  if (element instanceof Y.Map && element.size > 0) return named
  const data = readCell(ref.cellId, cell)
  const properties = elementProperties(data.style, data.value)
  const id = named ?? newId()
  writeCell(cells, { ...data, style: { ...styleWith(data.style, undefined), ...definedStyle(properties), [ELEMENT_KEY]: id } })
  return id
}

/** The style keys of properties that have a value. */
function definedStyle(properties: ElementProperties): Record<string, StyleValue> {
  const style: Record<string, StyleValue> = {}
  if (properties.name) style[ELEMENT_STYLE_KEYS.name] = properties.name
  if (properties.kind) style[ELEMENT_STYLE_KEYS.kind] = properties.kind
  if (properties.technology) style[ELEMENT_STYLE_KEYS.technology] = properties.technology
  if (properties.description) style[ELEMENT_STYLE_KEYS.description] = properties.description
  if (properties.owner) style[ELEMENT_STYLE_KEYS.owner] = properties.owner
  if (properties.tags.length > 0) style[ELEMENT_STYLE_KEYS.tags] = [...properties.tags]
  return style
}

/**
 * Makes the cell `ref` an element of its own: a new element with the properties of the one it showed, which keeps its
 * other cells. Returns the new element, or `null` when the cell shows no element. Call inside a transaction.
 */
export function detachCell(doc: Y.Doc, ref: CellRef): string | null {
  const cells = getCells(doc, ref.pageId)
  const cell = cells.get(ref.cellId)
  const previous = cell instanceof Y.Map ? cellElementId(cell) : null
  if (previous === null) return null
  const data = readCell(ref.cellId, cell!)
  const id = newId()
  writeCell(cells, { ...data, style: { ...data.style, [ELEMENT_KEY]: id } })
  dropUnusedElements(doc, [previous])
  return id
}

/**
 * Makes the shapes `refs`, and all the cells of all pages that show their elements, cells of one element with the
 * properties of `keep`: its element, or a new one with the properties its label tells. Their labels are made of these
 * properties; the elements merged into it go. Returns the element, or `null` when `keep` may not be an element. Call
 * inside a transaction.
 */
export function mergeElements(doc: Y.Doc, refs: readonly CellRef[], keep: CellRef): string | null {
  const target = ensureElement(doc, keep)
  if (target === null) return null
  const merged = new Set<string>()
  const anonymous: CellRef[] = []
  for (const ref of refs) {
    const cells = getCells(doc, ref.pageId)
    const cell = cells.get(ref.cellId)
    if (!(cell instanceof Y.Map) || !mayBeElement(cells, ref.cellId)) continue
    const id = cellElementId(cell)
    if (id === null) anonymous.push(ref)
    else if (id !== target) merged.add(id)
  }
  const join = (cells: CellsMap, cellId: string) => {
    const cell = cells.get(cellId)!
    const own = ownStyle(cell)
    const before = readCell(cellId, cell).style
    const value = String(cell.get('value') ?? '')
    const style = cell.get('style') as Y.Map<StyleValue>
    style.set(ELEMENT_KEY, target)
    const label = labelNow({ ...own, [ELEMENT_KEY]: target }, before, value, doc)
    if (label !== value) cell.set('value', label)
  }
  for (const ref of anonymous) join(getCells(doc, ref.pageId), ref.cellId)
  if (merged.size > 0) {
    for (const page of listPages(doc)) {
      const cells = getCells(doc, page.id)
      cells.forEach((cell, cellId) => {
        const id = cell instanceof Y.Map ? cellElementId(cell) : null
        if (id !== null && merged.has(id)) join(cells, cellId)
      })
    }
  }
  dropUnusedElements(doc, merged)
  return target
}

/** The cell `id` of a page is locked, itself or by a group above it, as a lock on the canvas holds it. */
export function isLockedCell(cells: CellsMap, id: string): boolean {
  const seen = new Set<string>()
  for (let current: string | null = id; current !== null && !seen.has(current); ) {
    seen.add(current)
    const cell = cells.get(current)
    if (!(cell instanceof Y.Map)) return false
    if (isLockedStyle(ownStyle(cell))) return true
    const parent = cell.get('parent')
    current = typeof parent === 'string' ? parent : null
  }
  return false
}

/** Where an element is: on each page that has its cells, those that removing it from all pages removes and keeps. */
export interface ElementPlace {
  pageId: string
  pageName: string
  cellIds: string[]
  /** Its cells that are locked: removing the element from all pages leaves them. */
  locked: string[]
}

/** The pages with the cells of the element `id`, in their order. */
export function elementPlaces(doc: Y.Doc, id: string): ElementPlace[] {
  const places: ElementPlace[] = []
  for (const page of listPages(doc)) {
    const cells = getCells(doc, page.id)
    const cellIds: string[] = []
    const locked: string[] = []
    cells.forEach((cell, cellId) => {
      if (!(cell instanceof Y.Map) || cellElementId(cell) !== id) return
      cellIds.push(cellId)
      if (isLockedCell(cells, cellId)) locked.push(cellId)
    })
    if (cellIds.length > 0) places.push({ pageId: page.id, pageName: page.name, cellIds, locked })
  }
  return places
}

/**
 * The cells `ids` of a page with the cells inside them and the edges that end at any of these, as removing them on the
 * canvas goes.
 */
function removal(cells: CellsMap, ids: Iterable<string>): Set<string> {
  const removed = new Set<string>()
  const children = new Map<string, string[]>()
  cells.forEach((cell, cellId) => {
    const parent = cell instanceof Y.Map ? cell.get('parent') : null
    if (typeof parent !== 'string') return
    const list = children.get(parent)
    if (list) list.push(cellId)
    else children.set(parent, [cellId])
  })
  const add = (cellId: string) => {
    if (removed.has(cellId)) return
    removed.add(cellId)
    children.get(cellId)?.forEach(add)
  }
  for (const id of ids) add(id)
  for (let grown = true; grown; ) {
    grown = false
    cells.forEach((cell, cellId) => {
      if (removed.has(cellId) || !(cell instanceof Y.Map) || cell.get('kind') !== 'edge') return
      const source = cell.get('source')
      const target = cell.get('target')
      if ((typeof source === 'string' && removed.has(source)) || (typeof target === 'string' && removed.has(target))) {
        add(cellId)
        grown = true
      }
    })
  }
  return removed
}

/**
 * Removes the cells of the element `id` from all pages, with what they hold and their edges; locked cells stay, and so
 * does the element while they do. Elements of other removed cells that no cell shows any longer go too. Returns the
 * removed cells. Call inside a transaction.
 */
export function removeElementCells(doc: Y.Doc, id: string): CellRef[] {
  const removedRefs: CellRef[] = []
  const elements = new Set<string>([id])
  for (const place of elementPlaces(doc, id)) {
    const cells = getCells(doc, place.pageId)
    const locked = new Set(place.locked)
    const removed = removal(
      cells,
      place.cellIds.filter((cellId) => !locked.has(cellId)),
    )
    for (const cellId of removed) {
      const element = cellElementId(cells.get(cellId))
      if (element !== null) elements.add(element)
      cells.delete(cellId)
      removedRefs.push({ pageId: place.pageId, cellId })
    }
  }
  dropUnusedElements(doc, elements)
  return removedRefs
}
