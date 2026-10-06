import type { Cell, CellEditorHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor, type LabelEditing } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { connect } from './testing.ts'

describe('editing a label in place', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc(), readOnly = false) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { doc, editor }
  }

  /** Everything the editor reports about editing, in order. */
  function record(editor: DiagramEditor) {
    const reported: (LabelEditing | null)[] = []
    editor.onEditingChange((editing) => reported.push(editing))
    return reported
  }

  const textarea = (editor: DiagramEditor) => editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!
  const type = (editor: DiagramEditor, text: string) => {
    textarea(editor).textContent = text
  }
  const press = (editor: DiagramEditor, key: string, keyCode: number) =>
    textarea(editor).dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))
  const textOf = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!).value

  it('reports the cell when editing starts and nothing once it is applied', () => {
    const { doc, editor } = open()
    const shape = editor.addShape('rectangle', { x: 100, y: 100 })!
    const reported = record(editor)

    editor.graph.setSelectionCell(shape)
    editor.editLabel()

    expect(editor.getEditing()).toEqual({ cellId: shape.getId(), changedRemotely: false })
    type(editor, 'API')
    editor.graph.stopEditing(false)

    expect(reported).toEqual([{ cellId: shape.getId(), changedRemotely: false }, null])
    expect(editor.getEditing()).toBeNull()
    expect(textOf(doc, shape)).toBe('API')
  })

  it('reports the end of editing cancelled with Escape or stopped by losing focus', () => {
    const { doc, editor } = open()
    const shape = editor.addShape('rectangle', { x: 100, y: 100 })!
    const reported = record(editor)

    editor.graph.dblClick(new MouseEvent('dblclick'), shape)
    type(editor, 'API')
    press(editor, 'Escape', 27)
    expect(textOf(doc, shape)).toBe('')

    // The label editor commits when it loses focus, without the event of the graph.
    editor.graph.startEditingAtCell(shape)
    type(editor, 'Шлюз')
    textarea(editor).dispatchEvent(new FocusEvent('blur'))

    const editing = { cellId: shape.getId(), changedRemotely: false }
    expect(reported).toEqual([editing, null, editing, null])
    expect(textOf(doc, shape)).toBe('Шлюз')
  })

  it('reports the names of a table and its new field, which Enter applies', () => {
    const { editor } = open()
    const table = editor.addShape('table', { x: 100, y: 100 })!
    editor.graph.setSelectionCell(table)
    const reported = record(editor)

    const field = editor.addTableField()!
    type(editor, 'email text')
    press(editor, 'Enter', 13)
    editor.graph.startEditingAtCell(table)

    expect(reported).toEqual([
      { cellId: field.getId(), changedRemotely: false },
      null,
      { cellId: table.getId(), changedRemotely: false },
    ])
  })

  it('reports the end of editing one label before editing the next', () => {
    const { editor } = open()
    const first = editor.addShape('rectangle', { x: 100, y: 100 })!
    const second = editor.addShape('rectangle', { x: 300, y: 100 })!
    const reported = record(editor)

    editor.graph.startEditingAtCell(first)
    editor.graph.startEditingAtCell(second)

    expect(reported).toEqual([
      { cellId: first.getId(), changedRemotely: false },
      null,
      { cellId: second.getId(), changedRemotely: false },
    ])
  })

  it('reports once that another participant changed the label being edited, and still applies the text typed', () => {
    const alice = open()
    const bob = open(new Y.Doc())
    connect(alice.doc, bob.doc)
    const shape = alice.editor.addShape('rectangle', { x: 100, y: 100 })!
    const onBob = bob.editor.graph.getDataModel().getCell(shape.getId()!)!
    const other = alice.editor.addShape('rectangle', { x: 300, y: 100 })!
    const reported = record(bob.editor)

    bob.editor.graph.startEditingAtCell(onBob)
    type(bob.editor, 'API Gateway')
    // Neither a change of another label nor of the style of this one is a change of the label.
    alice.editor.graph.getDataModel().setValue(other, 'Очередь')
    alice.editor.graph.setSelectionCell(shape)
    alice.editor.setColor('fill', '#fecaca')
    expect(bob.editor.getEditing()).toEqual({ cellId: shape.getId(), changedRemotely: false })

    alice.editor.graph.getDataModel().setValue(shape, 'Шлюз')
    alice.editor.graph.getDataModel().setValue(shape, 'Шлюз API')
    expect(bob.editor.getEditing()).toEqual({ cellId: shape.getId(), changedRemotely: true })

    bob.editor.graph.stopEditing(false)

    expect(reported).toEqual([
      { cellId: shape.getId(), changedRemotely: false },
      { cellId: shape.getId(), changedRemotely: true },
      null,
    ])
    expect(textOf(alice.doc, shape)).toBe('API Gateway')
  })

  it('reports the end of editing when another participant removes the cell or the editor is destroyed', () => {
    const alice = open()
    const bob = open(new Y.Doc())
    connect(alice.doc, bob.doc)
    const removed = alice.editor.addShape('rectangle', { x: 100, y: 100 })!
    const kept = alice.editor.addShape('rectangle', { x: 300, y: 100 })!
    const reported = record(bob.editor)

    bob.editor.graph.startEditingAtCell(bob.editor.graph.getDataModel().getCell(removed.getId()!)!)
    alice.editor.graph.setSelectionCell(removed)
    alice.editor.deleteSelection()
    expect(bob.editor.getEditing()).toBeNull()

    bob.editor.graph.startEditingAtCell(bob.editor.graph.getDataModel().getCell(kept.getId()!)!)
    editors.splice(editors.indexOf(bob.editor), 1)
    bob.editor.destroy()

    expect(reported).toEqual([
      { cellId: removed.getId(), changedRemotely: false },
      null,
      { cellId: kept.getId(), changedRemotely: false },
      null,
    ])
  })

  it('never edits a label of a participant who may only view the page', () => {
    const owner = open()
    const shape = owner.editor.addShape('rectangle', { x: 100, y: 100 })!
    const viewer = open(owner.doc, true)
    const reported = record(viewer.editor)

    const onViewer = viewer.editor.graph.getDataModel().getCell(shape.getId()!)!
    viewer.editor.graph.setSelectionCell(onViewer)
    viewer.editor.editLabel()
    viewer.editor.graph.dblClick(new MouseEvent('dblclick'), onViewer)

    expect(reported).toEqual([])
    expect(viewer.editor.getEditing()).toBeNull()
  })
})
