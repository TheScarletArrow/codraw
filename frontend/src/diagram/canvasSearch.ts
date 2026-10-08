import * as Y from 'yjs'
import { TECHNOLOGY_KEY } from './elementKinds.ts'
import { cellElementId, getCells, getElements, type CellMap } from './model.ts'
import { listPages } from './pages.ts'
import { readingOrder } from './readingOrder.ts'

/** An element of a page whose text has what is searched: a shape, an edge, a table, or a field or index of a table. */
export interface CanvasMatch {
  pageId: string
  cellId: string
}

/** Whether two matches are the same element; ids of cells repeat on pages of one `.drawio` file. */
export const sameMatch = (a: CanvasMatch, b: CanvasMatch) => a.pageId === b.pageId && a.cellId === b.cellId

/** A text as the search compares it: lower case, «ё» as «е», every run of spaces and line breaks as one space. */
export function searchText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

/**
 * The text of the properties of a cell that its label does not show: the technology, description, owner and tags of the
 * element of a shape, the technology of an edge.
 */
function propertiesText(doc: Y.Doc, cell: CellMap | undefined): string {
  if (!(cell instanceof Y.Map)) return ''
  const element = cellElementId(cell)
  const map = element === null ? undefined : getElements(doc).get(element)
  const style = cell.get('style')
  const values = map instanceof Y.Map ? ['technology', 'description', 'owner', 'tags'].map((field) => map.get(field)) : []
  if (cell.get('kind') === 'edge' && style instanceof Y.Map) values.push(style.get(TECHNOLOGY_KEY))
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

/**
 * Elements of all pages of the board whose text has `query`, as {@link searchText} compares them, one match per element:
 * the pages in their order; on a page in the order of reading (see {@link readingOrder}): top to bottom and, at one
 * height, left to right, the children of an element — the fields and indexes of a table, the shapes of a group — right
 * after it. The text of an element is its label and the properties its label does not show (see {@link propertiesText}).
 * Empty for a blank query.
 */
export function searchCanvas(doc: Y.Doc, query: string): CanvasMatch[] {
  const wanted = searchText(query).trim()
  if (!wanted) return []
  return listPages(doc).flatMap((page) => {
    const cells = getCells(doc, page.id)
    return readingOrder(cells)
      .filter((node) => searchText(node.value).includes(wanted) || searchText(propertiesText(doc, cells.get(node.id))).includes(wanted))
      .map((node) => ({ pageId: page.id, cellId: node.id }))
  })
}

/**
 * The index of the match to go to from the current one (`current`, -1 without one): the next one with `direction` 1,
 * the previous one with -1, from the last to the first and back. Without a current one, the first match on the page
 * `pageId` or on a page after it, or with -1 the last one on it or before it, wrapping around the pages `pageIds`
 * in their order; -1 when there are no matches.
 */
export function stepMatch(
  matches: CanvasMatch[],
  current: number,
  direction: 1 | -1,
  pageIds: string[],
  pageId: string | null,
): number {
  const count = matches.length
  if (count === 0) return -1
  if (current >= 0 && current < count) return (current + direction + count) % count
  const page = pageId === null ? -1 : pageIds.indexOf(pageId)
  const pageOf = (match: CanvasMatch) => pageIds.indexOf(match.pageId)
  if (direction === 1) {
    const next = matches.findIndex((match) => pageOf(match) >= page)
    return next >= 0 ? next : 0
  }
  const previous = matches.findLastIndex((match) => pageOf(match) <= page)
  return previous >= 0 ? previous : count - 1
}
