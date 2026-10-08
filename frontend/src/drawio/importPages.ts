import * as Y from 'yjs'
import { writeAttribution, type Author } from '../diagram/attribution.ts'
import { newId } from '../diagram/ids.ts'
import { LINK_KEY, movedPageLink } from '../diagram/links.ts'
import {
  ELEMENT_KEY,
  elementIdOf,
  getCells,
  getPages,
  orderBetween,
  writeAttrs,
  writeCell,
  writePage,
} from '../diagram/model.ts'
import { deletePage, isPageEmpty, listPages } from '../diagram/pages.ts'
import type { DrawioPage } from './parse.ts'

/** Origin of imports: like other page operations, an import is not undoable. */
export const IMPORT_ORIGIN = 'codraw:import'

/**
 * Adds the pages of a draw.io file after the pages of the board in one transaction and returns their ids. A board
 * that has a single page without shapes gets exactly the pages of the file: the empty page is deleted. With an
 * `author`, the imported cells keep them as who changed them last. The elements of the cells get new ids. The first layer
 * of a page of the file is the main layer of its page.
 */
export function importPages(doc: Y.Doc, pages: DrawioPage[], author: Author | null = null): string[] {
  const existing = listPages(doc)
  const replaced = existing.length === 1 && isPageEmpty(doc, existing[0]!.id) ? existing[0]!.id : null
  const taken = new Set(getPages(doc).keys())
  let order = existing.at(-1)?.order ?? null
  const ids: string[] = []

  // The id of a diagram is kept when it is free, so that links to it keep working. Links of the file to a page whose id
  // was taken lead to its new id: to the first page of the file with that id, as in draw.io.
  const moved = new Map<string, string>()
  const pageIds = pages.map((page) => {
    const id = page.id && !taken.has(page.id) && getCells(doc, page.id).size === 0 ? page.id : newId()
    if (page.id && !moved.has(page.id)) moved.set(page.id, id)
    taken.add(id)
    return id
  })
  // Elements get new ids: an id the board does not have now may still come back with undo, a version or a proposal.
  // Cells of the file that name one element name one element of the board.
  const elementIds = new Map<string, string>()
  const elementOf = (id: string) => {
    if (!elementIds.has(id)) elementIds.set(id, newId())
    return elementIds.get(id)!
  }

  doc.transact(() => {
    const at = Date.now()
    for (const [index, page] of pages.entries()) {
      const id = pageIds[index]!
      order = orderBetween(order, null)
      writePage(doc, id, { name: page.name.trim() || `Страница ${existing.length + index + 1}`, order })
      const cells = getCells(doc, id)
      // The first layer of the file takes the place of the main layer that the page got.
      for (const layer of page.layers ?? []) writeCell(cells, layer)
      for (const { attrs, ...cell } of page.cells) {
        const link = movedPageLink(cell.style[LINK_KEY], moved)
        if (link !== cell.style[LINK_KEY]) cell.style = { ...cell.style, [LINK_KEY]: link! }
        const element = elementIdOf(cell.style)
        if (element !== null) cell.style = { ...cell.style, [ELEMENT_KEY]: elementOf(element) }
        writeCell(cells, cell)
        if (attrs) writeAttrs(cells.get(cell.id)!, attrs)
        if (author) writeAttribution(cells.get(cell.id)!, author, at)
      }
      ids.push(id)
    }
    if (replaced && ids.length > 0) deletePage(doc, replaced)
  }, IMPORT_ORIGIN)
  return ids
}
