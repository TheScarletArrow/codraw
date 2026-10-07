import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getCells, LAYER_CELL_ID, writeCell, writePage } from '../diagram/model.ts'
import { STATUS_KEY, writeStatus, type ElementStatus } from '../diagram/status.ts'
import { boardWith, edgeData, shapeData } from '../diagram/testing.ts'
import { canHaveStatus, countStatuses, listStatuses } from './statusList.ts'

const bob = { id: 'bob', name: 'Боб' }
const at = Date.UTC(2026, 9, 7, 9, 0, 0)

/** Sets statuses of cells of a page of the document. */
function mark(doc: Y.Doc, statuses: Record<string, ElementStatus>, pageId?: string) {
  const cells = getCells(doc, pageId)
  doc.transact(() => Object.entries(statuses).forEach(([id, status]) => writeStatus(cells.get(id)!, status, bob, at)))
}

describe('listStatuses', () => {
  it('lists the elements with statuses on all pages in the order of the pages and of reading', () => {
    const doc = boardWith(
      shapeData('low', 'a0', { value: 'Очередь', geometry: { x: 0, y: 300, width: 120, height: 60 } }),
      shapeData('high', 'a1', { value: 'API\nшлюз', geometry: { x: 200, y: 0, width: 120, height: 60 } }),
      shapeData('plain', 'a2', { value: 'Кэш', geometry: { x: 0, y: 0, width: 120, height: 60 } }),
    )
    doc.transact(() => {
      writePage(doc, 'second', { name: 'Схема БД', order: 'b0' })
      writeCell(getCells(doc, 'second'), shapeData('orders', 'a0', { style: { shape: 'table', childLayout: 'stackLayout' } }))
    })
    mark(doc, { low: 'review', high: 'done' })
    mark(doc, { orders: 'review' }, 'second')

    const items = listStatuses(doc)

    expect(items.map(({ pageId, pageName, cellId, title, status }) => [pageId, pageName, cellId, title, status])).toEqual([
      ['page-1', 'Страница 1', 'high', 'API', 'done'],
      ['page-1', 'Страница 1', 'low', 'Очередь', 'review'],
      ['second', 'Схема БД', 'orders', 'Таблица', 'review'],
    ])
    expect(items[0]).toMatchObject({ by: 'bob', name: 'Боб', at })
    expect(countStatuses(items)).toEqual({ draft: 0, review: 2, done: 1 })
  })

  it('names elements without a label by their kind', () => {
    const doc = boardWith(
      shapeData('group', 'a0', { style: { fillColor: 'none', strokeColor: 'none' } }),
      shapeData('inside', 'a0', { parent: 'group', style: { codrawShape: 'database' } }),
      shapeData('box', 'a1', { geometry: { x: 0, y: 200, width: 120, height: 60 } }),
    )
    mark(doc, { group: 'draft', inside: 'draft', box: 'draft' })

    expect(listStatuses(doc).map((item) => item.title)).toEqual(['Группа', 'База данных', 'Прямоугольник'])
  })

  it('leaves out statuses that elements may not have and that CoDraw does not know', () => {
    const doc = boardWith(shapeData('api', 'a0'), shapeData('db', 'a1'), edgeData('calls', 'a2', 'api', 'db'))
    const cells = getCells(doc)
    doc.transact(() => {
      cells.get('calls')!.set(STATUS_KEY, 'review')
      cells.get('db')!.set(STATUS_KEY, 'approved')
    })

    expect(listStatuses(doc)).toEqual([])
  })
})

describe('canHaveStatus', () => {
  it('gives statuses to shapes, tables, groups and shapes in groups, not to edges, rows of tables and labels of edges', () => {
    const doc = boardWith(
      shapeData('api', 'a0'),
      shapeData('orders', 'a1', { style: { shape: 'table', childLayout: 'stackLayout' } }),
      shapeData('id', 'a0', { parent: 'orders' }),
      shapeData('group', 'a2', { style: { fillColor: 'none', strokeColor: 'none' } }),
      shapeData('worker', 'a0', { parent: 'group' }),
      edgeData('calls', 'a3', 'api', 'worker'),
      shapeData('label', 'a0', { parent: 'calls', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true } }),
    )
    const cells = getCells(doc)

    expect(['api', 'orders', 'group', 'worker'].filter((id) => canHaveStatus(cells, id))).toEqual([
      'api',
      'orders',
      'group',
      'worker',
    ])
    expect(['id', 'calls', 'label', LAYER_CELL_ID, 'gone'].some((id) => canHaveStatus(cells, id))).toBe(false)
  })
})
