import { Geometry, GraphDataModel } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { CellStyle } from '@maxgraph/core'
import { createUndoManager, DiagramBinding, localOrigin, PageHistories } from './binding.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getElements, initializeDocument } from './model.ts'
import { addPage } from './pages.ts'
import { addVertex, childIds, connect, createClient } from './testing.ts'

describe('undo and redo', () => {
  it('undoes only the own change while another participant edits in parallel', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const aliceUndo = createUndoManager(getCells(alice.doc))
    const shared = addVertex(bob.model, 'Общая')
    const sharedId = shared.getId()!

    const own = addVertex(alice.model, 'Фигура Алисы')
    bob.model.setGeometry(bob.model.getCell(sharedId)!, new Geometry(400, 300, 120, 60))
    aliceUndo.undo()

    for (const client of [alice, bob]) {
      expect(client.model.getCell(own.getId()!)).toBeFalsy()
      expect(client.model.getCell(sharedId)?.getGeometry()).toMatchObject({ x: 400, y: 300 })
    }
  })

  it('redoes the undone change for everyone', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const aliceUndo = createUndoManager(getCells(alice.doc))
    const own = addVertex(alice.model, 'Фигура Алисы')
    aliceUndo.undo()

    aliceUndo.redo()

    expect(bob.model.getCell(own.getId()!)?.getValue()).toBe('Фигура Алисы')
    expect(childIds(alice.model)).toEqual(childIds(bob.model))
  })

  it('makes every action a separate step', () => {
    const alice = createClient()
    const undo = createUndoManager(getCells(alice.doc))
    const first = addVertex(alice.model, 'Первая')
    const second = addVertex(alice.model, 'Вторая')

    undo.undo()

    expect(alice.model.getCell(first.getId()!)).toBeTruthy()
    expect(alice.model.getCell(second.getId()!)).toBeFalsy()
  })

  it('does not record remote changes on the own stack', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const aliceUndo = createUndoManager(getCells(alice.doc))

    addVertex(bob.model, 'Фигура Боба')

    expect(aliceUndo.canUndo()).toBe(false)
  })

  it('restores a deleted shape with its value and geometry', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const undo = createUndoManager(getCells(alice.doc))
    const cell = addVertex(alice.model, 'Удалённая', { fillColor: '#f8cecc' }, new Geometry(50, 60, 70, 80))
    const id = cell.getId()!
    alice.model.remove(cell)

    undo.undo()

    const restored = bob.model.getCell(id)!
    expect(restored.getValue()).toBe('Удалённая')
    expect(restored.getGeometry()).toMatchObject({ x: 50, y: 60, width: 70, height: 80 })
    expect(restored.getStyle()).toEqual({ fillColor: '#f8cecc' })
  })

  it('keeps the history of a page while the participant visits another page', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID)
    const histories = new PageHistories(doc)
    // Every visit of a page creates a new canvas bound to its cells and takes the history of the page, as the editor does.
    const visit = (pageId: string) => {
      const model = new GraphDataModel()
      return { model, binding: new DiagramBinding(model, getCells(doc, pageId), localOrigin(pageId)), history: histories.get(pageId) }
    }

    const first = visit(DEFAULT_PAGE_ID)
    const own = addVertex(first.model, 'На первой странице')
    first.binding.destroy()
    const other = visit(second)
    addVertex(other.model, 'На второй странице')
    other.binding.destroy()
    const back = visit(DEFAULT_PAGE_ID)
    back.history.undo()

    expect(back.model.getCell(own.getId()!)).toBeFalsy()
    expect(getCells(doc, second).size).toBe(3)
    expect(histories.get(second).canUndo()).toBe(true)
  })

  it('keeps a change of an element out of the history of another page', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID)
    const histories = new PageHistories(doc)
    const visit = (pageId: string) => {
      const model = new GraphDataModel()
      return { model, binding: new DiagramBinding(model, getCells(doc, pageId), localOrigin(pageId)), history: histories.get(pageId) }
    }
    const style = (technology: string) => ({ [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawTechnology: technology }) as CellStyle

    const other = visit(second)
    const moved = addVertex(other.model, 'На второй странице')
    other.binding.destroy()
    const first = visit(DEFAULT_PAGE_ID)
    const payments = addVertex(first.model, 'Payments', style('Kotlin'))
    first.model.setStyle(payments, style('Go'))
    first.binding.destroy()
    const back = visit(second)
    back.history.undo()

    expect(back.model.getCell(moved.getId()!)).toBeFalsy()
    expect(getElements(doc).get('e1')!.get('technology')).toBe('Go')
    expect(histories.get(DEFAULT_PAGE_ID).undoStack).toHaveLength(2)
  })
})
