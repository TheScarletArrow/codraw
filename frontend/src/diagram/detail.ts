import { generateNKeysBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { writeAttribution, type Author } from './attribution.ts'
import { ELEMENT_KINDS, FRAME_SHAPES } from './elementKinds.ts'
import { composeLabel, elementProperties, shapeIdOf } from './elementProps.ts'
import { newId } from './ids.ts'
import { LINK_KEY, pageLink, parseLink } from './links.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from './locks.ts'
import { modelMessages } from './model.messages.ts'
import {
  cellElementId,
  ELEMENT_KEY,
  getCells,
  getElements,
  isElementStyleKey,
  LAYER_CELL_ID,
  readCell,
  writeCell,
  writePage,
  type CellData,
  type CellsMap,
  type StyleValue,
} from './model.ts'
import { listPages, orderAfterPage } from './pages.ts'
import { ensureElement, isLockedCell, mayBeElement, type CellRef } from './sharedElements.ts'
import { findShape, markedStyle } from './shapes.ts'

/**
 * Detail of an element of C4 on a page of its own, the way a diagram of C4 goes a level down: a software system gets a
 * page «<name>: контейнеры», a container or a service «<name>: компоненты». The page has the boundary of the element —
 * a cell of the same element, so that its name and description are the element's — and, outside it, the elements
 * the element is connected to on its page, as cells of the same elements, with the edges and their labels going to the
 * boundary. The shape links to the page and the boundary back. The page names what it details (`detailOf`), which the
 * crumbs over the canvas follow: «Контекст › Payments › API».
 *
 * Everything here works on the document: the editor runs it in a transaction of its page, which makes it one undo step.
 */

/** What the page of detail of an element shows: the containers of a system, or the components of a container. */
export type DetailLevel = 'containers' | 'components'

/** Horizontal room between the boundary and the elements around it, and vertical room between these. */
const GAP_X = 120
const GAP_Y = 40

/** The least size of the boundary of a page of detail. */
const BOUNDARY_WIDTH = 640
const BOUNDARY_HEIGHT = 400

/** Keys of the style of an edge that tie it to the places of its ends and the way it went on its page. */
const EDGE_PLACE_KEYS = ['exitX', 'exitY', 'exitDx', 'exitDy', 'exitPerimeter', 'entryX', 'entryY', 'entryDx', 'entryDy', 'entryPerimeter']

/**
 * The level of detail of a shape: a software system that is not external gets containers, a container that is no store
 * of data nor channel of messages — a service, a gateway, an application — gets components. Frames and others get none.
 */
export function detailLevel(style: Record<string, unknown>, value: string): DetailLevel | null {
  const shape = shapeIdOf(style)
  if (shape !== null && FRAME_SHAPES[shape]) return null
  const kind = elementProperties(style, value).kind
  const info = kind === null ? undefined : ELEMENT_KINDS[kind]
  if (info?.c4 === 'system' && !info.external) return 'containers'
  if (info?.c4 === 'container' && info.variant === 'plain') return 'components'
  return null
}

/** Whether the cell of a page is a shape that may get a page of detail. */
export function canDetail(doc: Y.Doc, ref: CellRef): boolean {
  const cells = getCells(doc, ref.pageId)
  const cell = cells.get(ref.cellId)
  if (!(cell instanceof Y.Map) || !mayBeElement(cells, ref.cellId)) return false
  const data = readCell(ref.cellId, cell)
  return detailLevel(data.style, data.value) !== null
}

/**
 * The page of detail of the shape: the page its link leads to, when that page details something, or a page that
 * details its element; `null` without one.
 */
export function detailPageOf(doc: Y.Doc, ref: CellRef): string | null {
  const cell = getCells(doc, ref.pageId).get(ref.cellId)
  if (!(cell instanceof Y.Map)) return null
  const details = listPages(doc).filter((page) => page.detailOf !== undefined && page.id !== ref.pageId)
  const style = cell.get('style')
  const link = parseLink(style instanceof Y.Map ? style.get(LINK_KEY) : undefined)
  if (link?.kind === 'page' && details.some((page) => page.id === link.pageId)) return link.pageId
  const element = cellElementId(cell)
  const page = details.find(
    ({ detailOf }) => (detailOf!.pageId === ref.pageId && detailOf!.cellId === ref.cellId) || (element !== null && detailOf!.elementId === element),
  )
  return page?.id ?? null
}

/** A cell that may be an element, as the list of elements takes it: one of a kind, or a cell of an element. */
function isElementCell(cells: CellsMap, data: CellData): boolean {
  return mayBeElement(cells, data.id) && (cellElementId(cells.get(data.id)) !== null || elementProperties(data.style, data.value).kind !== null)
}

/** The style of a cell without its lock and its link: a copy of it on another page is neither locked nor a link. */
function lookOf(style: Record<string, StyleValue>): Record<string, StyleValue> {
  const { [LOCKED_KEY]: _locked, [LOCKED_BY_KEY]: _lockedBy, [LINK_KEY]: _link, ...look } = style
  return look
}

/**
 * Makes the page of detail of the shape `ref` right after its page; `null` when the shape may not get one or is locked.
 * The shape and the elements around it become elements if they are none yet. Returns the page and the cells of the
 * page of the shape that changed. Call inside a transaction.
 */
export function createDetailPage(doc: Y.Doc, ref: CellRef, author: Author | null = null): { pageId: string; changed: string[] } | null {
  const cells = getCells(doc, ref.pageId)
  if (!canDetail(doc, ref) || isLockedCell(cells, ref.cellId)) return null
  const elementId = ensureElement(doc, ref)
  if (elementId === null) return null
  const page = Array.from(cells.entries(), ([id, cell]) => readCell(id, cell))
  const byId = new Map(page.map((cell) => [cell.id, cell]))
  const element = byId.get(ref.cellId)!
  const level = detailLevel(element.style, element.value)!
  const properties = elementProperties(element.style, element.value)

  // The end of an edge as the detail sees it: the element itself, an element connected to it, or nothing.
  const endOf = (id: string | null): string | null => {
    for (let cell = id ? byId.get(id) : undefined; cell; cell = cell.parent ? byId.get(cell.parent) : undefined) {
      if (cell.id === ref.cellId || isElementCell(cells, cell)) return cell.id
    }
    return null
  }
  const edges: { edge: CellData; neighbour: string; incoming: boolean }[] = []
  for (const cell of page) {
    if (cell.kind !== 'edge') continue
    const source = endOf(cell.source)
    const target = endOf(cell.target)
    if (source === ref.cellId && target !== null && target !== ref.cellId) edges.push({ edge: cell, neighbour: target, incoming: false })
    if (target === ref.cellId && source !== null && source !== ref.cellId) edges.push({ edge: cell, neighbour: source, incoming: true })
  }
  // An element that calls the element goes to the left of the boundary, the others to the right; top to bottom as on
  // their page.
  const left = new Set(edges.filter((item) => item.incoming).map((item) => item.neighbour))
  const neighbours = [...new Set(edges.map((item) => item.neighbour))].sort((a, b) => (byId.get(a)!.geometry?.y ?? 0) - (byId.get(b)!.geometry?.y ?? 0))
  const columns = [neighbours.filter((id) => left.has(id)), neighbours.filter((id) => !left.has(id))]
  const sizeOf = (id: string) => byId.get(id)!.geometry ?? { width: 120, height: 60 }
  const columnWidth = (ids: string[]) => Math.max(0, ...ids.map((id) => sizeOf(id).width))
  const columnHeight = (ids: string[]) => ids.reduce((sum, id) => sum + sizeOf(id).height, 0) + GAP_Y * Math.max(0, ids.length - 1)
  const height = Math.max(BOUNDARY_HEIGHT, ...columns.map((ids) => columnHeight(ids) + 2 * GAP_Y))
  const boundaryX = columns[0]!.length > 0 ? columnWidth(columns[0]!) + GAP_X : 0
  const columnX = [0, boundaryX + BOUNDARY_WIDTH + GAP_X]

  const pageId = newId()
  writePage(doc, pageId, {
    name: modelMessages.detailPage[level](properties.name || modelMessages.unnamed),
    order: orderAfterPage(doc, ref.pageId),
    detailOf: { pageId: ref.pageId, cellId: ref.cellId, elementId },
  })
  const target = getCells(doc, pageId)
  const written: string[] = []
  const add = (data: CellData) => {
    writeCell(target, data)
    written.push(data.id)
  }

  // The boundary is a cell of the element, which leads back to the page of the shape.
  const boundaryStyle: Record<string, StyleValue> = {
    ...(markedStyle(findShape('c4-boundary')!) as Record<string, StyleValue>),
    ...Object.fromEntries(Object.entries(element.style).filter(([key]) => isElementStyleKey(key))),
    [ELEMENT_KEY]: elementId,
    [LINK_KEY]: pageLink(ref.pageId),
  }
  const layerOrders = generateNKeysBetween(null, null, 1 + neighbours.length + edges.length)
  const boundaryId = newId()
  add({
    id: boundaryId,
    kind: 'vertex',
    parent: LAYER_CELL_ID,
    order: layerOrders[0]!,
    value: composeLabel(properties, boundaryStyle),
    geometry: { x: boundaryX, y: 0, width: BOUNDARY_WIDTH, height },
    source: null,
    target: null,
    style: boundaryStyle,
  })

  const copies = new Map<string, string>()
  const changed = [ref.cellId]
  let order = 1
  columns.forEach((ids, column) => {
    let y = (height - columnHeight(ids)) / 2
    for (const id of ids) {
      // A locked shape does not change: its copy is a cell of its element only when it is one already.
      const locked = isLockedCell(cells, id)
      const shared = locked ? cellElementId(cells.get(id)) : ensureElement(doc, { pageId: ref.pageId, cellId: id })
      if (!locked) changed.push(id)
      const source = readCell(id, cells.get(id)!)
      const { width, height: shapeHeight } = sizeOf(id)
      const copy = newId()
      copies.set(id, copy)
      add({
        id: copy,
        kind: 'vertex',
        parent: LAYER_CELL_ID,
        order: layerOrders[order++]!,
        value: source.value,
        geometry: { x: columnX[column]! + (columnWidth(ids) - width) / 2, y, width, height: shapeHeight },
        source: null,
        target: null,
        style: { ...lookOf(source.style), ...(shared !== null && { [ELEMENT_KEY]: shared }) },
      })
      y += shapeHeight + GAP_Y
    }
  })

  for (const { edge, neighbour, incoming } of edges) {
    const copy = newId()
    const style = lookOf(edge.style)
    for (const key of EDGE_PLACE_KEYS) delete style[key]
    const geometry = edge.geometry
    add({
      id: copy,
      kind: 'edge',
      parent: LAYER_CELL_ID,
      order: layerOrders[order++]!,
      value: edge.value,
      geometry: { x: geometry?.x ?? 0, y: geometry?.y ?? 0, width: 0, height: 0, relative: true, ...(geometry?.offset && { offset: geometry.offset }) },
      source: incoming ? copies.get(neighbour)! : boundaryId,
      target: incoming ? boundaryId : copies.get(neighbour)!,
      style,
    })
    // The labels of their own on the edge go with it.
    const labels = page.filter((cell) => cell.parent === edge.id && cell.kind === 'vertex')
    const orders = generateNKeysBetween(null, null, labels.length)
    labels.forEach((label, index) => add({ ...label, id: newId(), parent: copy, order: orders[index]!, style: lookOf(label.style) }))
  }

  // The shape leads to its detail.
  ;(cells.get(ref.cellId)!.get('style') as Y.Map<StyleValue>).set(LINK_KEY, pageLink(pageId))
  if (author) {
    const at = Date.now()
    writeAttribution(cells.get(ref.cellId)!, author, at)
    for (const id of written) writeAttribution(target.get(id)!, author, at)
  }
  return { pageId, changed }
}

/** A crumb of the way down to a page of detail: the page, named by the element it details, or by itself at the top. */
export interface DetailCrumb {
  pageId: string
  label: string
}

/**
 * The way from the page at the top down to the page `pageId` through the pages of detail: «Контекст», «Payments»,
 * «API». Empty for a page that details nothing.
 */
export function detailCrumbs(doc: Y.Doc, pageId: string): DetailCrumb[] {
  const pages = new Map(listPages(doc).map((page) => [page.id, page]))
  const crumbs: DetailCrumb[] = []
  const seen = new Set<string>()
  for (let page = pages.get(pageId); page && !seen.has(page.id); ) {
    seen.add(page.id)
    const of = page.detailOf
    const above = of ? pages.get(of.pageId) : undefined
    if (!of || !above || seen.has(above.id)) {
      crumbs.unshift({ pageId: page.id, label: page.name })
      break
    }
    const element = getElements(doc).get(of.elementId)
    const name = element instanceof Y.Map ? element.get('name') : undefined
    crumbs.unshift({ pageId: page.id, label: typeof name === 'string' && name ? name : page.name })
    page = above
  }
  return crumbs.length > 1 ? crumbs : []
}
