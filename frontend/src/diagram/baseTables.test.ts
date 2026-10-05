import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { baseTableId, inheritedFieldId, isBaseTable } from './baseTables.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'

describe('base tables', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc(), readOnly = false) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return editor
  }

  /** `BaseEntity (id)`, `AuditableEntity (created_at, updated_at)`, `users (email)` and `boards (title)`, none a base yet. */
  function openSchema(doc?: Y.Doc) {
    const editor = open(doc)
    const builder = new DiagramBuilder()
    builder.table('BaseEntity', 0, 0, ['id uuid PK'])
    builder.table('AuditableEntity', 300, 0, ['created_at timestamptz NOT NULL', 'updated_at timestamptz'])
    builder.table('users', 0, 300, ['email text NOT NULL'])
    builder.table('boards', 300, 300, ['title text'])
    editor.insertCells(builder.build())
    const table = (name: string) => tableOf(editor, name)
    return { editor, base: table('BaseEntity'), auditable: table('AuditableEntity'), users: table('users'), boards: table('boards') }
  }

  const tableOf = (editor: DiagramEditor, name: string) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => cell.getValue() === name)!
  // An edge between fields of one table is a child of the table.
  const fields = (table: Cell) => table.getChildren().filter((cell) => cell.isVertex())
  const texts = (table: Cell) => fields(table).map((field) => field.getValue())
  const inherited = (table: Cell) => fields(table).map((field) => inheritedFieldId(field) !== null)
  const makeBase = (editor: DiagramEditor, ...tables: Cell[]) =>
    tables.forEach((table) => {
      editor.graph.setSelectionCell(table)
      editor.setBaseTable(true)
    })
  const setBase = (editor: DiagramEditor, table: Cell, base: Cell | null) => {
    editor.graph.setSelectionCell(table)
    editor.setTableBase(base?.getId() ?? null)
  }

  it('makes a table a base table and offers it as the base of the other tables', () => {
    const { editor, base, users } = openSchema()

    makeBase(editor, base)

    expect(isBaseTable(base)).toBe(true)
    expect(editor.getState().tableBase).toMatchObject({ base: true, defaultBase: false, baseId: null, options: [] })
    editor.graph.setSelectionCell(users)
    expect(editor.getState().tableBase).toEqual({
      base: false,
      defaultBase: false,
      baseId: null,
      options: [{ id: base.getId(), name: 'BaseEntity' }],
    })
    editor.undo()
    expect(isBaseTable(base)).toBe(false)
  })

  it('shows the fields of the whole chain of bases first, from the root one', () => {
    const { editor, base, auditable, users } = openSchema()
    makeBase(editor, base, auditable)
    setBase(editor, auditable, base)

    setBase(editor, users, auditable)

    expect(texts(auditable)).toEqual(['id uuid PK', 'created_at timestamptz NOT NULL', 'updated_at timestamptz'])
    expect(texts(users)).toEqual(['id uuid PK', 'created_at timestamptz NOT NULL', 'updated_at timestamptz', 'email text NOT NULL'])
    expect(inherited(users)).toEqual([true, true, true, false])
    expect(baseTableId(users)).toBe(auditable.getId())
    expect(inheritedFieldId(users.getChildAt(0))).toBe(base.getChildAt(0).getId())
  })

  it('changes the inherited fields with the fields of the base, each change as one undo step', () => {
    const { editor, base, users, boards } = openSchema()
    makeBase(editor, base)
    setBase(editor, users, base)
    setBase(editor, boards, base)

    editor.graph.setSelectionCell(base.getChildAt(0))
    editor.setFieldProps({ type: 'bigint' })
    expect(texts(users)[0]).toBe('id bigint PK')
    expect(texts(boards)[0]).toBe('id bigint PK')
    editor.undo()
    expect(texts(users)[0]).toBe('id uuid PK')
    expect(texts(boards)[0]).toBe('id uuid PK')

    editor.graph.setSelectionCell(base.getChildAt(0))
    editor.addTableField()
    editor.graph.stopEditing(true)
    editor.graph.getDataModel().setValue(base.getChildAt(1), 'version int')
    expect(texts(users)).toEqual(['id uuid PK', 'version int', 'email text NOT NULL'])

    editor.graph.setSelectionCell(base.getChildAt(0))
    editor.deleteSelection()
    expect(texts(users)).toEqual(['version int', 'email text NOT NULL'])
  })

  it('keeps a field of its own over an inherited one with the same name', () => {
    const { editor, base, users } = openSchema()
    editor.graph.getDataModel().setValue(base.getChildAt(0), 'email text')
    editor.graph.setSelectionCell(base.getChildAt(0))
    editor.addTableField()
    editor.graph.stopEditing(true)
    editor.graph.getDataModel().setValue(base.getChildAt(1), 'created_at timestamptz')
    makeBase(editor, base)

    setBase(editor, users, base)

    expect(texts(users)).toEqual(['created_at timestamptz', 'email text NOT NULL'])
    expect(inherited(users)).toEqual([true, false])
  })

  it('does not let the participant edit or delete an inherited field, and names its base', () => {
    const { editor, base, users } = openSchema()
    makeBase(editor, base)
    setBase(editor, users, base)
    const copy = users.getChildAt(0)
    editor.graph.setSelectionCell(copy)

    editor.deleteSelection()
    editor.setFieldProps({ type: 'bigint' })

    expect(texts(users)).toEqual(['id uuid PK', 'email text NOT NULL'])
    expect(editor.graph.isCellEditable(copy)).toBe(false)
    expect(editor.getState().field).toMatchObject({ cellId: copy.getId(), inheritedFrom: 'BaseEntity' })
  })

  it('keeps the edges of inherited fields when the base changes', () => {
    const { editor, base, users, boards } = openSchema()
    makeBase(editor, base)
    setBase(editor, users, base)
    const graph = editor.graph
    const edge = graph.insertEdge({ parent: graph.getDefaultParent(), value: '', source: boards.getChildAt(0), target: users.getChildAt(0) })

    graph.setSelectionCell(base.getChildAt(0))
    editor.setFieldProps({ type: 'bigint' })

    expect(edge.getTerminal(false)).toBe(users.getChildAt(0))
    expect(edge.getParent()).not.toBeNull()
  })

  it('removes the inherited fields when the table gets no base', () => {
    const { editor, base, users } = openSchema()
    makeBase(editor, base)
    setBase(editor, users, base)

    setBase(editor, users, null)

    expect(texts(users)).toEqual(['email text NOT NULL'])
    expect(baseTableId(users)).toBeNull()
  })

  it('keeps the inherited fields as fields of their own when the base table is removed, in one undo step', () => {
    const { editor, base, auditable, users } = openSchema()
    makeBase(editor, base, auditable)
    setBase(editor, auditable, base)
    setBase(editor, users, auditable)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: users.getChildAt(0), target: users.getChildAt(3) })

    editor.graph.setSelectionCell(base)
    editor.deleteSelection()

    expect(texts(auditable)).toEqual(['id uuid PK', 'created_at timestamptz NOT NULL', 'updated_at timestamptz'])
    expect(inherited(auditable)).toEqual([false, false, false])
    expect(texts(users)).toEqual(['id uuid PK', 'created_at timestamptz NOT NULL', 'updated_at timestamptz', 'email text NOT NULL'])
    expect(inherited(users)).toEqual([true, true, true, false])
    expect(inheritedFieldId(users.getChildAt(0))).toBe(auditable.getChildAt(0).getId())
    expect(edge.getTerminal(true)).toBe(users.getChildAt(0))

    editor.undo()
    expect(tableOf(editor, 'BaseEntity')).toBeDefined()
    expect(inherited(auditable)).toEqual([true, false, false])
  })

  it('keeps the inherited fields as fields of their own when the table stops being a base', () => {
    const { editor, base, users } = openSchema()
    makeBase(editor, base)
    setBase(editor, users, base)

    editor.graph.setSelectionCell(base)
    editor.setBaseTable(false)

    expect(texts(users)).toEqual(['id uuid PK', 'email text NOT NULL'])
    expect(inherited(users)).toEqual([false, false])
    expect(baseTableId(users)).toBeNull()
  })

  it('offers no base that would make a cycle', () => {
    const { editor, base, auditable } = openSchema()
    makeBase(editor, base, auditable)
    setBase(editor, auditable, base)

    editor.graph.setSelectionCell(base)
    expect(editor.getState().tableBase?.options).toEqual([])
    editor.setTableBase(auditable.getId())

    expect(baseTableId(base)).toBeNull()
  })

  it('gives a new table the default base of the page instead of the field of the preset', () => {
    const { editor, base, auditable } = openSchema()
    makeBase(editor, base, auditable)
    editor.graph.setSelectionCell(base)
    editor.setDefaultBase(true)
    editor.graph.setSelectionCell(auditable)
    editor.setDefaultBase(true)
    expect(editor.getState().tableBase).toMatchObject({ base: true, defaultBase: true })
    editor.graph.setSelectionCell(base)
    expect(editor.getState().tableBase?.defaultBase).toBe(false)

    const table = editor.addShape('table', { x: 700, y: 700 })!

    expect(baseTableId(table)).toBe(auditable.getId())
    expect(texts(table)).toEqual(['created_at timestamptz NOT NULL', 'updated_at timestamptz'])
    expect(inherited(table)).toEqual([true, true])
    editor.undo()
    expect(tableOf(editor, 'Таблица')).toBeUndefined()
  })

  it('brings the inherited fields to the other participants', () => {
    const doc = new Y.Doc()
    const other = new Y.Doc()
    doc.on('update', (update: Uint8Array) => Y.applyUpdate(other, update))
    const { editor, base, users } = openSchema(doc)
    const viewer = open(other, true)
    makeBase(editor, base)
    setBase(editor, users, base)

    editor.graph.setSelectionCell(base.getChildAt(0))
    editor.setFieldProps({ type: 'bigint' })

    expect(texts(tableOf(viewer, 'users'))).toEqual(['id bigint PK', 'email text NOT NULL'])
    expect(inherited(tableOf(viewer, 'users'))).toEqual([true, false])
  })

  it('draws a base table with a dashed border and the inherited fields muted', () => {
    const { editor, base, users } = openSchema()
    makeBase(editor, base)
    setBase(editor, users, base)

    expect(editor.graph.getCellStyle(base)).toMatchObject({ dashed: true })
    expect(editor.graph.getCellStyle(users).dashed).toBeFalsy()
    expect(editor.graph.getCellStyle(users.getChildAt(0)).fontColor).toBe('#6e7781')
    expect(editor.graph.getCellStyle(users.getChildAt(1)).fontColor).not.toBe('#6e7781')
  })
})
