import * as Y from 'yjs'
import { absoluteBounds } from '../board/changes.ts'
import { cellOrigin } from '../diagram/diff.ts'
import { BASE_TABLE_KEY, INHERITED_KEY } from '../diagram/baseTables.ts'
import { newId } from '../diagram/ids.ts'
import { boardImageOf } from '../diagram/images.ts'
import { ELEMENT_KEY, elementIdOf, getCells, initializeDocument, LAYER_CELL_ID, readAttrs, readCell, ROOT_CELL_ID, writeAttrs, writeCell, writePage } from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { LINK_KEY, movedPageLink, parseLink } from '../diagram/links.ts'
import { parseDrawio, type DrawioPage } from '../drawio/parse.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { embeddedImages } from '../image/inlineImages.ts'

/** A portable snapshot: diagram cells only, without comments, history, attribution or review marks. */
export async function templateSnapshot(source: Y.Doc, selection?: { pageId: string; ids: string[] }): Promise<string> {
  const snapshot = new Y.Doc()
  initializeDocument(snapshot)
  const pages = listPages(source).filter((page) => selection === undefined || page.id === selection.pageId)
  if (pages.length === 0) throw new Error('Страница недоступна')
  try {
    for (const page of pages) {
      writePage(snapshot, page.id, { name: page.name, order: page.order })
      const originals = new Map([...getCells(source, page.id)].filter(([id]) => id !== ROOT_CELL_ID && id !== LAYER_CELL_ID).map(([id, entry]) => [id, { ...readCell(id, entry), attrs: readAttrs(entry), extra: {} }]))
      const included = selection ? new Set(selection.ids) : new Set(originals.keys())
      // A field belongs to a table; it cannot form a meaningful reusable fragment alone.
      if (selection) {
        for (const id of [...included]) {
          const cell = originals.get(id)
          if (cell?.parent && originals.get(cell.parent)?.style.childLayout === 'stackLayout') included.add(cell.parent)
          if (cell?.kind === 'edge') { if (cell.source) included.add(cell.source); if (cell.target) included.add(cell.target) }
        }
        const children = new Map<string, string[]>()
        for (const cell of originals.values()) if (cell.parent) children.set(cell.parent, [...(children.get(cell.parent) ?? []), cell.id])
        const queue = [...included]
        for (let i = 0; i < queue.length; i++) for (const id of children.get(queue[i]!) ?? []) if (!included.has(id)) { included.add(id); queue.push(id) }
        for (const cell of originals.values()) if (cell.kind === 'edge' && cell.source && cell.target && included.has(cell.source) && included.has(cell.target)) included.add(cell.id)
        const connected = [...included]
        for (let i = 0; i < connected.length; i++) for (const id of children.get(connected[i]!) ?? []) if (!included.has(id)) { included.add(id); connected.push(id) }
      }
      let count = 0
      for (const cell of originals.values()) {
        if (cell.kind === 'root' || cell.kind === 'layer' || !included.has(cell.id)) continue
        count++
        let copy = cell
        if (cell.parent && !included.has(cell.parent)) {
          const box = absoluteBounds(originals, cell.id)
          const origin = cellOrigin(originals, cell)
          let geometry = box ? { ...cell.geometry!, x: box.x, y: box.y } : cell.geometry
          if (cell.kind === 'edge' && geometry && origin) {
            const move = (point: { x: number; y: number }) => ({ x: point.x + origin.x, y: point.y + origin.y })
            geometry = { ...geometry, ...(geometry.points && { points: geometry.points.map(move) }), ...(geometry.sourcePoint && { sourcePoint: move(geometry.sourcePoint) }), ...(geometry.targetPoint && { targetPoint: move(geometry.targetPoint) }) }
          }
          copy = { ...cell, parent: LAYER_CELL_ID, geometry }
        }
        writeCell(getCells(snapshot, page.id), copy)
        writeAttrs(getCells(snapshot, page.id).get(cell.id)!, cell.attrs)
      }
      if (selection && count === 0) throw new Error('Выделите элементы для шаблона')
    }
    // Initialization's empty page is not part of a multi-page source whose ids differ from the default.
    const names = new Set(pages.map((page) => page.id))
    for (const page of listPages(snapshot)) if (!names.has(page.id)) snapshot.getMap('pages').delete(page.id)
    const images = await embeddedImages(snapshot)
    for (const page of pages) for (const [id, entry] of getCells(snapshot, page.id)) {
      const image = readCell(id, entry).style.image
      if (typeof image === 'string' && boardImageOf(image) && !images.has(image)) throw new Error('Не удалось скопировать изображение. Повторите сохранение при наличии связи.')
    }
    return exportDrawio(snapshot, images)
  } finally { snapshot.destroy() }
}

/** New identities on every use, while shared elements and internal page links stay consistent within the copy. */
export async function personalTemplatePages(xml: string): Promise<DrawioPage[]> {
  const pages = await parseDrawio(xml)
  const pageIds = new Map(pages.flatMap((page) => page.id ? [[page.id, newId()] as const] : []))
  const elements = new Map<string, string>()
  const element = (old: string) => { if (!elements.has(old)) elements.set(old, newId()); return elements.get(old)! }
  return pages.map((page) => {
    const ids = new Map([[ROOT_CELL_ID, ROOT_CELL_ID], [LAYER_CELL_ID, LAYER_CELL_ID], ...page.cells.map((cell) => [cell.id, newId()] as [string, string])])
    const remap = (id: string | null) => id === null ? null : ids.get(id) ?? null
    return { ...page, id: page.id ? pageIds.get(page.id)! : newId(), cells: page.cells.map((cell) => {
      const style = { ...cell.style }
      const shared = elementIdOf(style)
      if (shared) style[ELEMENT_KEY] = element(shared)
      for (const key of [BASE_TABLE_KEY, INHERITED_KEY]) if (typeof style[key] === 'string') {
        const value = ids.get(style[key] as string)
        if (value) style[key] = value; else delete style[key]
      }
      const link = movedPageLink(style[LINK_KEY], pageIds)
      const originalLink = parseLink(style[LINK_KEY])
      if (originalLink?.kind === 'page' && !pageIds.has(originalLink.pageId)) delete style[LINK_KEY]
      else if (link === null) delete style[LINK_KEY]; else if (link !== undefined) style[LINK_KEY] = link
      return { ...cell, id: ids.get(cell.id)!, parent: remap(cell.parent) ?? LAYER_CELL_ID, source: remap(cell.source), target: remap(cell.target), style }
    }) }
  })
}
