import * as Y from 'yjs'
import { newId } from '../diagram/ids.ts'
import { getCells, getPages, orderBetween, writeAttrs, writeCell, writePage } from '../diagram/model.ts'
import { deletePage, isPageEmpty, listPages } from '../diagram/pages.ts'
import type { DrawioPage } from './parse.ts'

/** Origin of imports: like other page operations, an import is not undoable. */
export const IMPORT_ORIGIN = 'codraw:import'

/**
 * Adds the pages of a draw.io file after the pages of the board in one transaction and returns their ids. A board
 * that has a single page without shapes gets exactly the pages of the file: the empty page is deleted.
 */
export function importPages(doc: Y.Doc, pages: DrawioPage[]): string[] {
  const existing = listPages(doc)
  const replaced = existing.length === 1 && isPageEmpty(doc, existing[0]!.id) ? existing[0]!.id : null
  const taken = new Set(getPages(doc).keys())
  let order = existing.at(-1)?.order ?? null
  const ids: string[] = []

  doc.transact(() => {
    for (const [index, page] of pages.entries()) {
      // The id of the diagram is kept when it is free, so that links to it keep working.
      const id = page.id && !taken.has(page.id) && getCells(doc, page.id).size === 0 ? page.id : newId()
      taken.add(id)
      order = orderBetween(order, null)
      writePage(doc, id, { name: page.name.trim() || `Страница ${existing.length + index + 1}`, order })
      const cells = getCells(doc, id)
      for (const { attrs, ...cell } of page.cells) {
        writeCell(cells, cell)
        if (attrs) writeAttrs(cells.get(cell.id)!, attrs)
      }
      ids.push(id)
    }
    if (replaced && ids.length > 0) deletePage(doc, replaced)
  }, IMPORT_ORIGIN)
  return ids
}
