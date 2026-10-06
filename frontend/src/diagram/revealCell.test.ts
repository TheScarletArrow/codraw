import { Geometry } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'

describe('revealing a cell', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc(), readOnly = false) {
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return editor
  }

  it('selects the cell and centres the canvas on its middle', () => {
    const editor = open()
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(400, 300, 100, 60))
    editor.graph.clearSelection()
    const centerOn = vi.spyOn(editor, 'centerOn')

    expect(editor.revealCell(cell.getId()!)).toBe(true)

    expect(editor.graph.getSelectionCells()).toEqual([cell])
    expect(centerOn).toHaveBeenCalledWith({ x: 450, y: 330 })
  })

  it('clears the selection, in a read-only editor too', () => {
    const doc = new Y.Doc()
    const cell = open(doc).addShape('rectangle', { x: 100, y: 100 })!
    const viewer = open(doc, true)
    viewer.revealCell(cell.getId()!)
    expect(viewer.graph.getSelectionCount()).toBe(1)

    viewer.clearSelection()

    expect(viewer.graph.getSelectionCount()).toBe(0)
  })

  it('reports a cell that the page does not have', () => {
    const editor = open()

    expect(editor.revealCell('missing')).toBe(false)
    expect(editor.revealCell('1')).toBe(false)
    expect(editor.graph.getSelectionCount()).toBe(0)
  })
})
