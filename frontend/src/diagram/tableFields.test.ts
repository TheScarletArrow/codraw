import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { nameX } from './tableRows.ts'
import { tableRowsOf } from './tableShapes.ts'

describe('fields of tables', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(readOnly = false, doc = new Y.Doc()) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { doc, editor }
  }

  /** Tables `users (id uuid PK)` and `boards (id uuid PK, owner_id uuid NOT NULL)` without an edge between them. */
  function openSchema() {
    const opened = open()
    const builder = new DiagramBuilder()
    builder.table('users', 0, 0, ['id uuid PK'])
    builder.table('boards', 300, 0, ['id uuid PK', 'owner_id uuid NOT NULL'])
    opened.editor.insertCells(builder.build())
    const graph = opened.editor.graph
    const table = (name: string) => graph.getDefaultParent().getChildren().find((cell) => cell.getValue() === name)!
    const field = (table: Cell, index: number) => table.getChildAt(index)
    return { ...opened, users: table('users'), boards: table('boards'), field }
  }

  const textOf = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!).value
  const undoSteps = (editor: DiagramEditor) => {
    let steps = 0
    while (editor.getState().canUndo) {
      editor.undo()
      steps++
    }
    return steps
  }

  it('draws a field in columns with its name as the label, and a table with its database', () => {
    const { editor } = open()
    const table = editor.addShape('table', { x: 100, y: 100 })!
    const field = table.getChildAt(0)

    expect(table.getStyle()).toMatchObject({ dbVendor: 'postgresql', autosize: true })
    expect(editor.graph.getCellStyle(table).shape).toBe('swimlane')
    expect(editor.graph.getCellStyle(field).shape).toBe('codraw.tableField')
    expect(editor.graph.getLabel(field)).toBe('id')
    expect(tableRowsOf(editor.graph, table).get(field)).toMatchObject({
      icons: ['key'],
      columns: [{ text: 'uuid' }, { text: 'NOT NULL' }],
    })
  })

  it('edits the name of a field and keeps its type and keys, or takes a whole field', () => {
    const { doc, editor } = open()
    const field = editor.addShape('table', { x: 100, y: 100 })!.getChildAt(0)

    expect(editor.graph.getEditingValue(field, null as never)).toBe('id')
    editor.graph.labelChanged(field, 'user_id', null as never)
    expect(textOf(doc, field)).toBe('user_id uuid PK')

    editor.graph.labelChanged(field, 'email text NOT NULL', null as never)
    expect(textOf(doc, field)).toBe('email text NOT NULL')
  })

  it('sets the type and the keys of the selected field, each as one undo step', () => {
    const { doc, editor } = open()
    const field = editor.addShape('table', { x: 100, y: 100 })!.getChildAt(0)
    editor.graph.setSelectionCell(field)
    expect(editor.getState().field).toEqual({ type: 'uuid', notNull: true, primaryKey: true, unique: false })

    editor.setFieldProps({ primaryKey: false })
    expect(textOf(doc, field)).toBe('id uuid NOT NULL')
    editor.setFieldProps({ type: 'bigint NOT NULL' })
    expect(textOf(doc, field)).toBe('id bigint NOT NULL')
    editor.setFieldProps({ notNull: false, unique: true })
    expect(textOf(doc, field)).toBe('id bigint UNIQUE')
    expect(editor.getState().field).toEqual({ type: 'bigint', notNull: false, primaryKey: false, unique: true })
    expect(tableRowsOf(editor.graph, field.getParent()!).get(field)!.icons).toEqual(['unique'])
    editor.setFieldProps({ primaryKey: true })
    expect(textOf(doc, field)).toBe('id bigint PK UNIQUE')
    expect(tableRowsOf(editor.graph, field.getParent()!).get(field)!.icons).toEqual(['key', 'unique'])
    expect(editor.graph.getCellStyle(field).spacingLeft).toBe(nameX(2))

    // Adding the table is one more step.
    expect(undoSteps(editor)).toBe(5)
  })

  it('sets the database of the selected table or of the table of the selected field as one undo step', () => {
    const { doc, editor } = open()
    const table = editor.addShape('table', { x: 100, y: 100 })!
    editor.graph.setSelectionCell(table.getChildAt(0))
    expect(editor.getState().tableVendor).toBe('postgresql')

    editor.setTableVendor('oracle')

    expect(readCell(table.getId()!, getCells(doc).get(table.getId()!)!).style.dbVendor).toBe('oracle')
    expect(editor.getState().tableVendor).toBe('oracle')
    expect(undoSteps(editor)).toBe(2)
  })

  it('changes no field or table of a page that is only viewed', () => {
    const { doc, editor } = open()
    const table = editor.addShape('table', { x: 100, y: 100 })!
    const viewer = open(true, doc).editor
    const field = viewer.graph.getDataModel().getCell(table.getChildAt(0).getId()!)!
    viewer.graph.setSelectionCell(field)

    viewer.setFieldProps({ type: 'text' })
    viewer.setTableVendor('mysql')

    expect(textOf(doc, field)).toBe('id uuid PK')
    expect(readCell(table.getId()!, getCells(doc).get(table.getId()!)!).style.dbVendor).toBe('postgresql')
  })

  it('shows in a field the field its edge refers to, and follows a renamed table', () => {
    const { editor, users, boards, field } = openSchema()
    const owner = field(boards, 1)
    const redraw = vi.spyOn(editor.graph.cellRenderer, 'redraw')

    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: owner, target: field(users, 0) })

    expect(tableRowsOf(editor.graph, boards).get(owner)).toMatchObject({
      icons: ['link'],
      columns: [{ text: 'uuid' }, { text: 'NOT NULL' }, { text: '→ users.id' }],
    })
    expect(redraw).toHaveBeenCalledWith(editor.graph.getView().getState(owner), true, true)

    redraw.mockClear()
    editor.graph.labelChanged(users, 'accounts', null as never)

    expect(tableRowsOf(editor.graph, boards).get(owner)!.columns.at(-1)!.text).toBe('→ accounts.id')
    expect(redraw).toHaveBeenCalledWith(editor.graph.getView().getState(owner), true, true)
  })

  it('tells the referring end of an edge drawn from the referenced field', () => {
    const { editor, users, boards, field } = openSchema()
    const owner = field(boards, 1)

    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: field(users, 0), target: owner })

    expect(tableRowsOf(editor.graph, boards).get(owner)!.columns.at(-1)!.text).toBe('→ users.id')
    expect(tableRowsOf(editor.graph, users).get(field(users, 0))!.columns).toHaveLength(2)
  })
})
