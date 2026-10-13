import * as Y from 'yjs'
import { getCheckSettings } from '../checks/checks.ts'
import { writeAttribution, type Author } from '../diagram/attribution.ts'
import { newId } from '../diagram/ids.ts'
import type { ImageHost } from '../diagram/images.ts'
import { LINK_KEY, movedPageLink } from '../diagram/links.ts'
import {
  cellElementId,
  ELEMENT_KEY,
  ELEMENT_STYLE_KEYS,
  elementIdOf,
  getCells,
  getElements,
  getPages,
  isElementStyleKey,
  orderBetween,
  writeAttrs,
  writeCell,
  writePage,
  type DetailOf,
  type ElementField,
  type StyleValue,
  type ViewData,
} from '../diagram/model.ts'
import { isPageEmpty, listPages } from '../diagram/pages.ts'
import { STATUS_KEY } from '../diagram/status.ts'
import { modelMessages } from '../diagram/model.messages.ts'
import { COMPUTED_KEY } from '../diagram/viewRule.ts'
import { IMPORT_ORIGIN } from '../drawio/importPages.ts'
import { blobToDataUri } from '../image/inlineImages.ts'
import type { FileElement } from './format.ts'
import type { BoardFile } from './read.ts'

const ELEMENT_FIELDS = Object.keys(ELEMENT_STYLE_KEYS) as ElementField[]

/** At most this many pictures of a file are uploaded at once. */
const PARALLEL_UPLOADS = 4

/**
 * Puts the pictures of the archive where the board keeps pictures: on the board of `host`, and the cells that show them
 * point at them there. A picture that could not be stored, or any picture without a host, is written into its cells as
 * a `data:` address, so that it still shows. Only pictures that cells show are uploaded.
 */
export async function placeBoardFileImages(file: BoardFile, host: ImageHost | null): Promise<void> {
  const cells = file.pages.flatMap((page) => page.cells)
  const shown = new Set(cells.flatMap((cell) => (typeof cell.style.image === 'string' && file.images.has(cell.style.image) ? [cell.style.image] : [])))
  const pending = [...shown]
  const urls = new Map<string, string>()
  const worker = async () => {
    for (let path = pending.shift(); path !== undefined; path = pending.shift()) {
      const picture = file.images.get(path)!
      const stored = host ? await host.store(picture) : null
      urls.set(path, stored?.url ?? (await blobToDataUri(picture)))
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, pending.length) }, worker))
  for (const cell of cells) {
    const url = typeof cell.style.image === 'string' ? urls.get(cell.style.image) : undefined
    if (url !== undefined) cell.style.image = url
  }
}

/** Replaces whole ids in keys that are made of ids, e.g. `<frame>~<element>`, `nesting:<page>/<cell>`. */
function tokenReplacer(renamed: ReadonlyMap<string, string>): (text: string) => string {
  if (renamed.size === 0) return (text) => text
  const ids = [...renamed.keys()].sort((a, b) => b.length - a.length).map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(?<![\\w-])(?:${ids.join('|')})(?![\\w-])`, 'g')
  return (text) => text.replace(pattern, (id) => renamed.get(id) ?? id)
}

/**
 * Adds the pages of a `.codraw` file after the pages of the board in one transaction, as an import of draw.io does, and
 * returns their ids. A board that has a single page without shapes gets exactly the pages of the file: then the id of
 * that page is free for the file too, so a new board from a file has the ids of the board it was saved from.
 *
 * Ids of pages and of elements that the board has free stay; a taken one is replaced, and everything of the file that
 * names it — links, details, the cells, the model and the views of an element, hidden remarks — names the new one. So a
 * file imported into the board it was saved from brings elements of its own rather than sharing those of the board.
 * With an `author`, the imported cells keep them as who changed them last; statuses come without who set them. The
 * settings of the rules of the checks come with a file that replaces an empty board; its hidden remarks always do.
 */
export function importBoardFile(doc: Y.Doc, file: BoardFile, author: Author | null = null): string[] {
  const pages = getPages(doc)
  const existing = listPages(doc)
  const replaced = existing.length === 1 && isPageEmpty(doc, existing[0]!.id) ? existing[0]!.id : null

  const takenPages = new Set([...pages.keys()].filter((id) => id !== replaced))
  const movedPages = new Map<string, string>()
  const pageIds = file.pages.map((page) => {
    const free = !takenPages.has(page.id) && (page.id === replaced || getCells(doc, page.id).size === 0)
    const id = free ? page.id : newId()
    if (id !== page.id) movedPages.set(page.id, id)
    takenPages.add(id)
    return id
  })

  // An element of the file keeps its id unless the board has an element or a cell that names it.
  const takenElements = new Set(getElements(doc).keys())
  for (const id of pages.keys()) for (const cell of getCells(doc, id).values()) {
    const element = cellElementId(cell)
    if (element !== null) takenElements.add(element)
  }
  const renamedElements = new Map<string, string>()
  const elementOf = (id: string) => {
    if (!takenElements.has(id)) return id
    if (!renamedElements.has(id)) renamedElements.set(id, newId())
    return renamedElements.get(id)!
  }
  for (const page of file.pages) for (const cell of page.cells) {
    const element = elementIdOf(cell.style)
    if (element !== null) elementOf(element)
  }
  for (const id of Object.keys(file.elements)) elementOf(id)
  const retoken = tokenReplacer(new Map([...movedPages, ...renamedElements]))

  const detailOf = (detail: DetailOf): DetailOf => ({
    pageId: movedPages.get(detail.pageId) ?? detail.pageId,
    cellId: detail.cellId,
    elementId: elementOf(detail.elementId),
  })
  const view = ({ rule, hidden, places }: ViewData): ViewData => ({
    rule: { ...rule, scope: rule.scope === null ? null : elementOf(rule.scope) },
    hidden: hidden.map(retoken),
    places: Object.fromEntries(Object.entries(places).map(([key, place]) => [retoken(key), place])),
  })
  // The properties of an element come from the elements of the file, once for all its cells.
  const style = (own: Record<string, StyleValue>): Record<string, StyleValue> => {
    const element = elementIdOf(own)
    const result: Record<string, StyleValue> = {}
    for (const [key, value] of Object.entries(own)) if (element === null || !isElementStyleKey(key)) result[key] = value
    if (LINK_KEY in result) result[LINK_KEY] = movedPageLink(result[LINK_KEY], movedPages)
    if (typeof result[COMPUTED_KEY] === 'string') result[COMPUTED_KEY] = retoken(result[COMPUTED_KEY])
    if (element !== null) Object.assign(result, { [ELEMENT_KEY]: elementOf(element) }, propertiesStyle(file.elements[element]))
    return result
  }

  const ids: string[] = []
  doc.transact(() => {
    if (replaced) {
      // The empty page goes first, so that a page of the file may take its id.
      pages.delete(replaced)
      const cells = getCells(doc, replaced)
      Array.from(cells.keys()).forEach((id) => cells.delete(id))
    }
    const at = Date.now()
    const shown = new Set<string>()
    let order = existing.at(-1)?.order ?? null
    for (const [index, page] of file.pages.entries()) {
      const id = pageIds[index]!
      order = orderBetween(order, null)
      writePage(doc, id, {
        name: page.name.trim() || modelMessages.page((replaced ? 0 : existing.length) + index + 1),
        order,
        ...(page.detailOf && { detailOf: detailOf(page.detailOf) }),
        ...(page.view && { view: view(page.view) }),
      })
      const cells = getCells(doc, id)
      for (const { attrs, status, ...cell } of page.cells) {
        const data = { ...cell, style: style(cell.style) }
        writeCell(cells, data)
        const written = cells.get(cell.id)!
        if (attrs) writeAttrs(written, attrs)
        if (status) written.set(STATUS_KEY, status)
        const element = elementIdOf(data.style)
        if (element !== null) shown.add(element)
        if (author && cell.kind !== 'layer') writeAttribution(written, author, at)
      }
      ids.push(id)
    }

    // The place of each element in the model: the element it is a part of and the environment of a node.
    const elements = getElements(doc)
    for (const [id, element] of Object.entries(file.elements)) {
      const stored = elements.get(elementOf(id))
      if (!shown.has(elementOf(id)) || !(stored instanceof Y.Map)) continue
      if (element.parent !== undefined) stored.set('parent', elementOf(element.parent))
      if (element.environment !== undefined) stored.set('environment', element.environment)
    }

    const checks = getCheckSettings(doc)
    for (const [key, value] of Object.entries(file.checks)) {
      if (key.startsWith('hidden:')) checks.set(retoken(key), value)
      else if (replaced) checks.set(key, value)
    }
  }, IMPORT_ORIGIN)
  return ids
}

/** The properties of an element as the keys of the style of its cells. */
function propertiesStyle(element: FileElement | undefined): Record<string, StyleValue> {
  const style: Record<string, StyleValue> = {}
  if (!element) return style
  for (const field of ELEMENT_FIELDS) {
    const value = element[field]
    if (value !== undefined) style[ELEMENT_STYLE_KEYS[field]] = Array.isArray(value) ? [...value] : value
  }
  return style
}
