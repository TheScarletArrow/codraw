import { GraphDataModel, type Cell, type CellStyle } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createUndoManager, DiagramBinding, localOrigin } from './binding.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getElements, initializeDocument, writeCell } from './model.ts'
import { addPage } from './pages.ts'
import { connect, shapeData } from './testing.ts'

const PAYMENTS = {
  codrawShape: 'c4-container',
  [ELEMENT_KEY]: 'e1',
  codrawName: 'Payments',
  codrawKind: 'c4-container',
  codrawTechnology: 'Kotlin',
}
const LABEL = 'Payments\n[Container: Kotlin]'

/** A board where «Payments» stands on both pages, as `a` on the first and `b` on the second. */
function board(doc = new Y.Doc()) {
  initializeDocument(doc)
  const second = addPage(doc, DEFAULT_PAGE_ID)
  doc.transact(() => {
    writeCell(getCells(doc), shapeData('a', 'a0', { value: LABEL, style: PAYMENTS }))
    writeCell(getCells(doc, second), shapeData('b', 'a0', { value: LABEL, style: PAYMENTS }))
  })
  return { doc, second }
}

/** The canvas of a page: a model bound to its cells with the origin of the page. */
function canvas(doc: Y.Doc, pageId: string, readOnly = false) {
  const model = new GraphDataModel()
  const binding = new DiagramBinding(model, getCells(doc, pageId), localOrigin(pageId), readOnly)
  return { model, binding, cell: (id: string) => model.getCell(id)! }
}

/** Changes the properties and the label of a cell as the editor does: in one change of the model. */
function change(model: GraphDataModel, cell: Cell, properties: Record<string, string>, label: string) {
  model.batchUpdate(() => {
    model.setStyle(cell, { ...cell.getStyle(), ...properties } as CellStyle)
    model.setValue(cell, label)
  })
}

const valueOf = (doc: Y.Doc, pageId: string, id: string) => getCells(doc, pageId).get(id)!.get('value')

describe('cells of one element on several pages', () => {
  it('rewrites the label of the cell on another page in the transaction of the change, and undoes both in one step', () => {
    const { doc, second } = board()
    const first = canvas(doc, DEFAULT_PAGE_ID)
    const other = canvas(doc, second)
    const history = createUndoManager(getCells(doc), localOrigin(DEFAULT_PAGE_ID))
    let transactions = 0
    doc.on('afterTransaction', (transaction: Y.Transaction) => {
      if (transaction.origin === localOrigin(DEFAULT_PAGE_ID)) transactions++
    })

    change(first.model, first.cell('a'), { codrawName: 'Billing' }, 'Billing\n[Container: Kotlin]')

    expect(transactions).toBe(1)
    expect(valueOf(doc, second, 'b')).toBe('Billing\n[Container: Kotlin]')
    expect(other.cell('b').getValue()).toBe('Billing\n[Container: Kotlin]')
    expect(other.cell('b').getStyle()).toMatchObject({ codrawName: 'Billing' })

    history.undo()
    expect(valueOf(doc, second, 'b')).toBe(LABEL)
    expect(other.cell('b').getValue()).toBe(LABEL)
    expect(getElements(doc).get('e1')!.get('name')).toBe('Payments')
    history.redo()
    expect(other.cell('b').getValue()).toBe('Billing\n[Container: Kotlin]')
  })

  it('keeps the change out of the history of the other page', () => {
    const { doc, second } = board()
    const first = canvas(doc, DEFAULT_PAGE_ID)
    const otherHistory = createUndoManager(getCells(doc, second), localOrigin(second))

    change(first.model, first.cell('a'), { codrawName: 'Billing' }, 'Billing\n[Container: Kotlin]')

    expect(otherHistory.undoStack).toHaveLength(0)
  })

  it('shows the new label on a second cell of the element on the same page', () => {
    const { doc } = board()
    doc.transact(() => writeCell(getCells(doc), shapeData('a2', 'a1', { value: LABEL, style: PAYMENTS })))
    const first = canvas(doc, DEFAULT_PAGE_ID)

    change(first.model, first.cell('a'), { codrawTechnology: 'Go' }, 'Payments\n[Container: Go]')

    expect(valueOf(doc, DEFAULT_PAGE_ID, 'a2')).toBe('Payments\n[Container: Go]')
    expect(first.cell('a2').getValue()).toBe('Payments\n[Container: Go]')
  })

  it('puts the labels right after two participants changed different properties of the element at the same time', () => {
    const alice = board()
    const bobDoc = new Y.Doc()
    Y.applyUpdate(bobDoc, Y.encodeStateAsUpdate(alice.doc))
    const network = connect(alice.doc, bobDoc)
    const hers = canvas(alice.doc, DEFAULT_PAGE_ID)
    const his = canvas(bobDoc, alice.second)

    network.disconnect()
    change(hers.model, hers.cell('a'), { codrawTechnology: 'Go' }, 'Payments\n[Container: Go]')
    change(his.model, his.cell('b'), { codrawDescription: 'Платежи' }, 'Payments\n[Container: Kotlin]\nПлатежи')
    network.reconnect()

    const merged = 'Payments\n[Container: Go]\nПлатежи'
    for (const doc of [alice.doc, bobDoc]) {
      expect(valueOf(doc, DEFAULT_PAGE_ID, 'a')).toBe(merged)
      expect(valueOf(doc, alice.second, 'b')).toBe(merged)
    }
    expect(hers.cell('a').getValue()).toBe(merged)
    expect(his.cell('b').getValue()).toBe(merged)
  })

  it('puts a label right when the page opens, but not for a participant who may only view', () => {
    const { doc } = board()
    doc.transact(() => getCells(doc).get('a')!.set('value', 'Payments\n[Container]'))

    canvas(doc, DEFAULT_PAGE_ID, true)
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'a')).toBe('Payments\n[Container]')

    const editing = canvas(doc, DEFAULT_PAGE_ID)
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'a')).toBe(LABEL)
    expect(editing.cell('a').getValue()).toBe(LABEL)
  })
})
