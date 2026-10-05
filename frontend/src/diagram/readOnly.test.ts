import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { clipboard } from './clipboard.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('read-only editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc: Y.Doc, readOnly: boolean) {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return editor
  }

  /** A board with a rectangle and a table, as its owner made it. */
  function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const owner = open(doc, false)
    owner.addShape('rectangle', { x: 100, y: 100 })
    owner.addShape('table', { x: 400, y: 100 })
    return doc
  }

  it('shows the cells of the page', () => {
    const viewer = open(board(), true)

    expect(viewer.readOnly).toBe(true)
    expect(viewer.graph.getDefaultParent().getChildCount()).toBe(2)
  })

  it('changes nothing in the document whatever command it gets', () => {
    const doc = board()
    const before = Y.encodeStateVector(doc)
    const viewer = open(doc, true)
    viewer.selectAll()
    viewer.copy()

    expect(viewer.addShape('rectangle')).toBeNull()
    expect(viewer.addTableField()).toBeNull()
    viewer.paste()
    viewer.duplicate()
    viewer.cut()
    viewer.bringToFront()
    viewer.sendToBack()
    viewer.setColor('fill', '#ff0000')
    viewer.setFontSize(32)
    viewer.stepFontSize(1)
    viewer.setAutoWidth(true)
    viewer.setTextWrap(true)
    viewer.setBaseTable(true)
    viewer.setDefaultBase(true)
    viewer.setTableBase(null)
    viewer.setGeometry({ x: 0, width: 300 })
    viewer.editLabel()
    viewer.deleteSelection()
    viewer.undo()

    expect(Y.encodeStateVector(doc)).toEqual(before)
    expect(viewer.graph.getDefaultParent().getChildCount()).toBe(2)
    expect(viewer.graph.isEditing()).toBe(false)
  })

  it('lets the participant select and copy, so that they can paste on a board of their own', () => {
    const viewer = open(board(), true)

    viewer.selectAll()
    viewer.copy()

    expect(viewer.graph.getSelectionCount()).toBe(2)
    expect(clipboard.read()).toHaveLength(2)
  })

  it('locks the cells against moving, resizing, editing, connecting and deleting', () => {
    const viewer = open(board(), true)
    const shape = viewer.graph.getDefaultParent().getChildAt(0)

    expect(viewer.graph.isCellMovable(shape)).toBe(false)
    expect(viewer.graph.isCellResizable(shape)).toBe(false)
    expect(viewer.graph.isCellEditable(shape)).toBe(false)
    expect(viewer.graph.isCellDeletable(shape)).toBe(false)
    expect(viewer.graph.isConnectable()).toBe(false)
  })

  it('reports no undo, paste or quick connect', () => {
    const doc = board()
    clipboard.put([])
    const viewer = open(doc, true)
    viewer.graph.setSelectionCell(viewer.graph.getDefaultParent().getChildAt(0))

    expect(viewer.getState()).toMatchObject({ canUndo: false, canRedo: false, canPaste: false, quickConnect: null })
  })

  it('does not write to the document what changes in its own model', () => {
    const doc = board()
    const before = Y.encodeStateVector(doc)
    const viewer = open(doc, true)
    const shape = viewer.graph.getDefaultParent().getChildAt(0)

    // E.g. a layout run on this client only.
    viewer.graph.getDataModel().setValue(shape, 'Только у меня')

    expect(Y.encodeStateVector(doc)).toEqual(before)
    expect(getCells(doc).get(shape.getId()!)?.get('value')).not.toBe('Только у меня')
  })

  it('shows the changes of others', () => {
    const ownerDoc = board()
    const viewerDoc = new Y.Doc()
    connect(ownerDoc, viewerDoc)
    const viewer = open(viewerDoc, true)
    const owner = open(ownerDoc, false)

    owner.addShape('ellipse', { x: 700, y: 100 })

    expect(viewer.graph.getDefaultParent().getChildCount()).toBe(3)
  })
})
