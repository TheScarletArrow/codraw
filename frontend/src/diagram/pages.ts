import * as Y from 'yjs'
import { writeAttribution, type Author } from './attribution.ts'
import { newId } from './ids.ts'
import {
  cellElementId,
  compareCells,
  dropUnusedElements,
  ELEMENT_KEY,
  getCells,
  getElements,
  getPages,
  LAYER_CELL_ID,
  orderBetween,
  readPage,
  ROOT_CELL_ID,
  writePage,
  type CellMap,
  type PageData,
} from './model.ts'
import { clearStatus } from './status.ts'

/** Origin of page operations: they are not undoable. */
export const PAGES_ORIGIN = 'codraw:pages'

export interface PageInfo extends PageData {
  id: string
}

/** Pages of the board in their order. */
export function listPages(doc: Y.Doc): PageInfo[] {
  return Array.from(getPages(doc).entries(), ([id, entry]) => ({ id, ...readPage(entry) })).sort(compareCells)
}

/** «Страница N», where N is the number of pages with the new one, skipping names that are taken. */
export function nextPageName(pages: PageInfo[]): string {
  const taken = new Set(pages.map((page) => page.name))
  let number = pages.length + 1
  while (taken.has(`Страница ${number}`)) number++
  return `Страница ${number}`
}

/** An order key that puts a page between `before` and `after`; equal neighbours put it after `before`. */
function orderAfter(before: PageInfo | undefined, after: PageInfo | undefined): string {
  const low = before?.order ?? null
  const high = after?.order ?? null
  if (low !== null && high !== null && low >= high) return orderBetween(low, null)
  return orderBetween(low, high)
}

/** An order key that puts a new page right after the page `afterId`, or at the end. */
export function orderAfterPage(doc: Y.Doc, afterId: string | null): string {
  const pages = listPages(doc)
  const index = afterId ? pages.findIndex((page) => page.id === afterId) : -1
  const position = index >= 0 ? index : pages.length - 1
  return orderAfter(pages[position], pages[position + 1])
}

/** Adds an empty page after `afterId` (or at the end) and returns its id. */
export function addPage(doc: Y.Doc, afterId?: string | null, name?: string): string {
  const pages = listPages(doc)
  const index = afterId ? pages.findIndex((page) => page.id === afterId) : -1
  const position = index >= 0 ? index : pages.length - 1
  const id = newId()
  doc.transact(() => {
    writePage(doc, id, { name: name ?? nextPageName(pages), order: orderAfter(pages[position], pages[position + 1]) })
  }, PAGES_ORIGIN)
  return id
}

export function renamePage(doc: Y.Doc, id: string, name: string) {
  const entry = getPages(doc).get(id)
  const trimmed = name.trim()
  if (!(entry instanceof Y.Map) || !trimmed || entry.get('name') === trimmed) return
  doc.transact(() => entry.set('name', trimmed), PAGES_ORIGIN)
}

/** Moves a page so that it ends up at `index` in the list of pages. */
export function movePage(doc: Y.Doc, id: string, index: number) {
  const pages = listPages(doc)
  const from = pages.findIndex((page) => page.id === id)
  const entry = getPages(doc).get(id)
  if (from < 0 || !(entry instanceof Y.Map)) return
  const others = pages.filter((page) => page.id !== id)
  const to = Math.max(0, Math.min(index, others.length))
  if (to === from) return
  doc.transact(() => entry.set('order', orderAfter(others[to - 1], others[to])), PAGES_ORIGIN)
}

/**
 * Copies a page with all its cells right after it and returns the id of the copy. Cells get new ids, and cells of
 * elements copies of their elements, so the copy is independent of the original. With an `author`, the copies keep
 * them as who changed them last, as pasted copies do.
 */
export function duplicatePage(doc: Y.Doc, id: string, author: Author | null = null): string | null {
  const pages = listPages(doc)
  const index = pages.findIndex((page) => page.id === id)
  if (index < 0) return null
  const source = getCells(doc, id)
  const ids = new Map<string, string>([
    [ROOT_CELL_ID, ROOT_CELL_ID],
    [LAYER_CELL_ID, LAYER_CELL_ID],
  ])
  for (const cellId of source.keys()) if (!ids.has(cellId)) ids.set(cellId, newId())
  const remap = (value: unknown) => (typeof value === 'string' ? (ids.get(value) ?? value) : value)
  const elements = getElements(doc)
  // One copy of each element, should several cells of the page show it; an element the document lacks gets a new id too.
  const elementCopies = new Map<string, string>()
  source.forEach((cell) => {
    const element = cellElementId(cell)
    if (element !== null && !elementCopies.has(element)) elementCopies.set(element, newId())
  })

  const copyId = newId()
  const at = Date.now()
  doc.transact(() => {
    writePage(doc, copyId, { name: `${pages[index]!.name} (копия)`, order: orderAfter(pages[index], pages[index + 1]) })
    elementCopies.forEach((copy, element) => {
      const original = elements.get(element)
      if (original instanceof Y.Map) elements.set(copy, copyMap(original))
    })
    const target = getCells(doc, copyId)
    source.forEach((cell, cellId) => {
      if (cellId === ROOT_CELL_ID || cellId === LAYER_CELL_ID) return
      const copy = copyMap(
        cell,
        (key, value) => (REFERENCES.has(key) ? remap(value) : value),
        // The style of a cell of an element names the copy of the element.
        (key, value) => (key === ELEMENT_KEY && typeof value === 'string' ? (elementCopies.get(value) ?? value) : value),
      )
      // Written into the copy before it is added, so that the document keeps one value of each key. A copy is a new
      // element, which nobody has reviewed: it has no status.
      if (author) writeAttribution(copy, author, at)
      clearStatus(copy)
      target.set(ids.get(cellId)!, copy)
    })
  }, PAGES_ORIGIN)
  return copyId
}

/** Fields of a cell that hold ids of other cells. */
const REFERENCES = new Set(['parent', 'source', 'target'])

type Transform = (key: string, value: unknown) => unknown

const asIs: Transform = (_, value) => value

/**
 * A detached copy of a cell with values passed through `transform`; nested maps (style, custom properties) are
 * copied too, their values passed through `nested`. A detached map cannot be read until it is added to the document,
 * so values are changed on the way.
 */
function copyMap(map: CellMap, transform: Transform = asIs, nested: Transform = asIs): CellMap {
  const copy = new Y.Map<unknown>()
  map.forEach((value, key) =>
    copy.set(key, value instanceof Y.Map ? copyNested(value, nested) : structuredClone(transform(key, value))),
  )
  return copy
}

/** A detached copy of a nested map and the maps in it, with values passed through `transform`. */
const copyNested = (map: CellMap, transform: Transform) => copyMap(map, transform, transform)

/**
 * Deletes a page and its cells, with the elements that no other page shows; the last page cannot be deleted. Returns
 * whether the page was deleted.
 */
export function deletePage(doc: Y.Doc, id: string): boolean {
  const pages = getPages(doc)
  if (!pages.has(id) || pages.size <= 1) return false
  const cells = getCells(doc, id)
  doc.transact(() => {
    const elements = Array.from(cells.values(), (cell) => cellElementId(cell))
    pages.delete(id)
    // A top-level type cannot be removed from the document, so the cells are cleared instead.
    Array.from(cells.keys()).forEach((cellId) => cells.delete(cellId))
    dropUnusedElements(doc, elements)
  }, PAGES_ORIGIN)
  return true
}

/** A page without shapes and edges: only its root and layer cells. */
export function isPageEmpty(doc: Y.Doc, id: string): boolean {
  return Array.from(getCells(doc, id).keys()).every((cellId) => cellId === ROOT_CELL_ID || cellId === LAYER_CELL_ID)
}
