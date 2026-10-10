import * as Y from 'yjs'
import { cellLabel } from '../comments/threads.ts'
import { getCells, type CellMap, type CellsMap } from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { readingOrder } from '../diagram/readingOrder.ts'
import { isTableStyle, shapeOf } from '../diagram/shapes.ts'
import { readStatus, STATUS_KEY, type ElementStatus, type StatusMark } from '../diagram/status.ts'
import { changeMessages } from './changes.messages.ts'

/** An element of the board with a status, as the list of statuses shows it. */
export interface StatusItem extends StatusMark {
  pageId: string
  pageName: string
  cellId: string
  /** The label of the element as one short line, or its kind when it has none: «Таблица», «Группа», «Сервис». */
  title: string
}

/**
 * The elements of all pages of the board that have a status: the pages in their order, on a page in the order of
 * reading — top to bottom, left to right, the shapes of a group after it.
 */
export function listStatuses(doc: Y.Doc): StatusItem[] {
  return listPages(doc).flatMap((page) => {
    const cells = getCells(doc, page.id)
    // Most pages have no statuses: they are not put in order.
    if (!Array.from(cells.values()).some((cell) => cell instanceof Y.Map && cell.has(STATUS_KEY))) return []
    const nodes = readingOrder(cells)
    const parents = new Set(nodes.map((node) => node.parent))
    return nodes.flatMap((node) => {
      const mark = readStatus(cells.get(node.id))
      if (!mark || !canHaveStatus(cells, node.id)) return []
      const title = cellLabel(node.value) || kindOf(cells.get(node.id)!, parents.has(node.id))
      return [{ ...mark, pageId: page.id, pageName: page.name, cellId: node.id, title }]
    })
  })
}

/**
 * Whether the cell `id` of a page may have a status: a shape, a table or a group, also inside a group; not an edge, a
 * field or an index of a table, or a label of an edge.
 */
export function canHaveStatus(cells: CellsMap, id: string): boolean {
  const cell = cells.get(id)
  if (!(cell instanceof Y.Map) || cell.get('kind') !== 'vertex') return false
  const parentId = cell.get('parent')
  const parent = typeof parentId === 'string' ? cells.get(parentId) : undefined
  if (!(parent instanceof Y.Map)) return true
  if (parent.get('kind') === 'edge') return false
  const style = parent.get('style')
  return !(style instanceof Y.Map && isTableStyle(style.toJSON()))
}

/** How many elements of the list have each status. */
export function countStatuses(items: readonly StatusItem[]): Record<ElementStatus, number> {
  const counts: Record<ElementStatus, number> = { draft: 0, review: 0, done: 0 }
  for (const item of items) counts[item.status]++
  return counts
}

/** What an element without a label is: a table, a group (a container without a fill and a border) or a shape. */
function kindOf(cell: CellMap, hasChildren: boolean): string {
  const style = (cell.get('style') as Y.Map<unknown> | undefined)?.toJSON() ?? {}
  if (isTableStyle(style)) return changeMessages.kinds.table
  if (hasChildren && style.fillColor === 'none' && style.strokeColor === 'none') return changeMessages.kinds.group
  return shapeOf(style)?.label ?? changeMessages.kinds.shape
}
