import { Geometry } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import { createUndoManager } from './binding.ts'
import { getCells } from './model.ts'
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
})
