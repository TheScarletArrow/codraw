import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { createUndoManager, localOrigin } from './binding.ts'
import { getCells, readCell, writeCell, writePage, type CellData } from './model.ts'
import { VIEW_ORIGIN } from './modelViews.ts'
import { boardOf, connect } from './testing.ts'
import { attachViewKeeper } from './viewKeeper.ts'
import type { ViewRule } from './viewRule.ts'

const containersOf = (scope: string): ViewRule => ({ kind: 'containers', scope, environment: null, owners: [], tags: [], technologies: [] })

const names = (doc: Y.Doc, pageId: string) =>
  Array.from(getCells(doc, pageId).entries(), ([id, cell]) => readCell(id, cell))
    .filter((cell) => cell.kind === 'vertex')
    .map((cell) => cell.value.split('\n')[0])
    .sort()

/** A board whose page «Магазин» has the boundary of the system with an API in it, and a view of its containers. */
function board() {
  const page = new DiagramBuilder()
  page.shape('c4-boundary', 0, 0, { element: { name: 'Магазин', kind: 'c4-system' }, width: 800, height: 500 })
  page.shape('c4-container', 40, 80, { element: { name: 'API' } })
  const built = page.build()
  const shop = built[0]!.style.codrawElement as string
  const { doc, pages } = boardOf({ Магазин: page })
  doc.transact(() => built.forEach((cell) => writeCell(getCells(doc, pages.Магазин!), cell)))
  const view = 'view'
  doc.transact(() => writePage(doc, view, { name: 'Вид', order: 'z', view: { rule: containersOf(shop), hidden: [], places: {} } }))
  return { doc, page: pages.Магазин!, view }
}

/** Adds a container inside the boundary on the page, as a participant would, with the origin of the page. */
function addContainer(doc: Y.Doc, pageId: string, name: string, x = 400): CellData {
  const builder = new DiagramBuilder()
  builder.shape('c4-container', x, 80, { element: { name } })
  const [cell] = builder.build()
  doc.transact(() => writeCell(getCells(doc, pageId), cell!), localOrigin(pageId))
  return cell!
}

describe('the keeper of views', () => {
  it('fills the views when attached, and follows every change of the model', () => {
    const { doc, page, view } = board()
    expect(names(doc, view)).toEqual([])
    const detach = attachViewKeeper(doc)
    expect(names(doc, view)).toEqual(['API', 'Магазин'])
    addContainer(doc, page, 'Склад')
    expect(names(doc, view)).toEqual(['API', 'Магазин', 'Склад'])
    detach()
    addContainer(doc, page, 'Почта', 600)
    expect(names(doc, view)).not.toContain('Почта')
  })

  it('keeps out of the history: undoing the change of the model takes the view back, and redoing brings it again', () => {
    const { doc, page, view } = board()
    attachViewKeeper(doc)
    const history = createUndoManager(getCells(doc, page), localOrigin(page))
    const viewHistory = createUndoManager(getCells(doc, view), localOrigin(view))
    addContainer(doc, page, 'Склад')
    expect(names(doc, view)).toContain('Склад')
    // The participant moves the new cell on the view.
    const store = Array.from(getCells(doc, view).entries()).find(([, cell]) => String(cell.get('value')).startsWith('Склад'))!
    doc.transact(() => store[1].set('geometry', { ...(store[1].get('geometry') as object), x: 500, y: 300 }), localOrigin(view))
    history.undo()
    expect(names(doc, view)).not.toContain('Склад')
    history.redo()
    expect(names(doc, view)).toContain('Склад')
    expect(getCells(doc, view).get(store[0])!.get('geometry')).toMatchObject({ x: 500, y: 300 })
    // The view kept nothing in its own history but the move.
    expect(viewHistory.undoStack).toHaveLength(1)
  })

  it('makes one cell of a container that two participants bring into the view at the same time', () => {
    const { doc, page, view } = board()
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc))
    const link = connect(doc, other)
    attachViewKeeper(doc)
    attachViewKeeper(other)
    link.disconnect()
    addContainer(doc, page, 'Склад', 400)
    addContainer(other, page, 'Почта', 600)
    link.reconnect()
    for (const copy of [doc, other]) expect(names(copy, view)).toEqual(['API', 'Магазин', 'Почта', 'Склад'])
  })

  it('writes in transactions of its own origin only', () => {
    const { doc, page } = board()
    const origins: unknown[] = []
    doc.on('afterTransaction', (transaction: Y.Transaction) => {
      if (transaction.changed.size > 0) origins.push(transaction.origin)
    })
    attachViewKeeper(doc)
    addContainer(doc, page, 'Склад')
    expect(origins).toEqual([VIEW_ORIGIN, localOrigin(page), VIEW_ORIGIN])
  })
})
