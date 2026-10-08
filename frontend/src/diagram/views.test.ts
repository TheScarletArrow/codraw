import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { baseTableId, inheritedFieldId, isBaseTable } from './baseTables.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'
import { isIndexRow, tableRowsOf } from './tableShapes.ts'
import { isMaterializedStyle, isViewTable, MAX_VIEW_QUERY, normalizeViewQuery, viewBadge, viewQueryOf, VIEW_QUERY_KEY } from './views.ts'

describe('views', () => {
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

  /** The tables `users (id, email)` and `active_users (id, email)`, which is to become a view. */
  function openSchema(doc?: Y.Doc) {
    const editor = open(doc)
    const builder = new DiagramBuilder()
    builder.table('users', 0, 0, ['id uuid PK', 'email text NOT NULL'])
    builder.table('active_users', 300, 0, ['id uuid', 'email text'])
    editor.insertCells(builder.build())
    return { editor, users: tableOf(editor, 'users'), active: tableOf(editor, 'active_users') }
  }

  const tableOf = (editor: DiagramEditor, name: string) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => cell.getValue() === name)!
  const style = (cell: Cell) => cell.getStyle() as Record<string, unknown>
  const makeView = (editor: DiagramEditor, table: Cell) => {
    editor.graph.setSelectionCell(table)
    editor.setViewTable(true)
  }

  it('makes a table a view and back, each as one undo step, without its materialization and query', () => {
    const { editor, active } = openSchema()

    makeView(editor, active)
    expect(isViewTable(active)).toBe(true)
    expect(editor.getState().tableView).toEqual({ view: true, materialized: false, query: '' })
    editor.setViewMaterialized(true)
    editor.setViewQuery('  SELECT id, email FROM users WHERE deleted_at IS NULL;  ')
    expect(editor.getState().tableView).toEqual({ view: true, materialized: true, query: 'SELECT id, email FROM users WHERE deleted_at IS NULL' })
    expect(viewBadge(style(active))).toBe('MAT VIEW')

    editor.setViewTable(false)
    expect(isViewTable(active)).toBe(false)
    expect(style(active)).not.toHaveProperty(VIEW_QUERY_KEY)
    expect(isMaterializedStyle(style(active))).toBe(false)
    editor.undo()
    expect(editor.getState().tableView).toMatchObject({ view: true, materialized: true })
    editor.undo()
    expect(viewQueryOf(style(active))).toBe('')
    editor.undo()
    expect(isMaterializedStyle(style(active))).toBe(false)
    editor.undo()
    expect(isViewTable(active)).toBe(false)
  })

  it('removes the query when it is emptied, and keeps none too long', () => {
    const { editor, active } = openSchema()
    makeView(editor, active)
    editor.setViewQuery('SELECT 1')

    editor.setViewQuery('x'.repeat(MAX_VIEW_QUERY + 1))
    expect(viewQueryOf(style(active))).toBe('SELECT 1')
    editor.setViewQuery(' ; ')
    expect(style(active)).not.toHaveProperty(VIEW_QUERY_KEY)
  })

  it('makes a base table or a table that inherits one a view that is neither, its inherited fields its own', () => {
    const { editor, users, active } = openSchema()
    const builder = new DiagramBuilder()
    builder.table('Audited', 0, 300, ['created_at timestamptz'])
    editor.insertCells(builder.build())
    const audited = tableOf(editor, 'Audited')
    editor.graph.setSelectionCell(audited)
    editor.setBaseTable(true)
    editor.graph.setSelectionCell(active)
    editor.setTableBase(audited.getId()!)
    expect(active.getChildren().map((field) => [field.getValue(), inheritedFieldId(field) !== null])).toEqual([
      ['created_at timestamptz', true],
      ['id uuid', false],
      ['email text', false],
    ])

    makeView(editor, active)
    expect(baseTableId(active)).toBeNull()
    expect(active.getChildren().map((field) => [field.getValue(), inheritedFieldId(field) !== null])).toEqual([
      ['created_at timestamptz', false],
      ['id uuid', false],
      ['email text', false],
    ])
    editor.graph.setSelectionCell(users)
    editor.setBaseTable(true)
    editor.setDefaultBase(true)

    makeView(editor, users)
    expect(isBaseTable(users)).toBe(false)
    expect(style(users)).not.toHaveProperty('codrawBaseDefault')

    // Nor does a view become one again, or get a base.
    editor.setBaseTable(true)
    expect(isBaseTable(users)).toBe(false)
    editor.graph.setSelectionCell(active)
    editor.setTableBase(audited.getId()!)
    expect(baseTableId(active)).toBeNull()
  })

  it('adds indexes to a materialized view only, and shows its columns without nullability', () => {
    const { editor, active } = openSchema()
    makeView(editor, active)

    expect(editor.addTableIndex()).toBeNull()
    editor.setViewMaterialized(true)
    expect(editor.addTableIndex()).not.toBeNull()
    expect(active.getChildren().filter(isIndexRow)).toHaveLength(1)

    const rows = tableRowsOf(editor.graph, active)
    expect(rows.get(active.getChildAt(1))!.columns.map((column) => column.text)).toEqual(['text'])
    expect(editor.getState().field).toBeNull()
    editor.graph.setSelectionCell(active.getChildAt(1))
    expect(editor.getState().field).toMatchObject({ type: 'text', inView: true })
  })

  it('brings the view, its materialization and its query to the other participants', () => {
    const doc = new Y.Doc()
    const other = new Y.Doc()
    doc.on('update', (update: Uint8Array) => Y.applyUpdate(other, update))
    const { editor, active } = openSchema(doc)
    const viewer = open(other, true)

    makeView(editor, active)
    editor.setViewMaterialized(true)
    editor.setViewQuery('SELECT id, email FROM users')

    const seen = tableOf(viewer, 'active_users')
    expect(isViewTable(seen)).toBe(true)
    expect(viewBadge(style(seen))).toBe('MAT VIEW')
    expect(viewQueryOf(style(seen))).toBe('SELECT id, email FROM users')
  })

  it('changes nothing in a read-only editor', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const builder = new DiagramBuilder()
    builder.table('users', 0, 0, ['id uuid PK'])
    open(doc).insertCells(builder.build())
    const viewer = open(doc, true)
    const users = tableOf(viewer, 'users')

    viewer.graph.setSelectionCell(users)
    viewer.setViewTable(true)

    expect(isViewTable(users)).toBe(false)
  })

  it('widens a table with auto width for the badge of a view', () => {
    const editor = open()
    const builder = new DiagramBuilder()
    builder.table('a_rather_long_name_of_a_view', 0, 0, ['id int'])
    editor.insertCells(builder.build())
    const view = tableOf(editor, 'a_rather_long_name_of_a_view')
    editor.graph.setSelectionCell(view)
    editor.setAutoWidth(true)
    const width = view.getGeometry()!.width

    editor.setViewTable(true)
    editor.setViewMaterialized(true)

    expect(view.getGeometry()!.width).toBeGreaterThan(width)
  })

  it('keeps a query without spaces at its ends and the final semicolons', () => {
    expect(normalizeViewQuery('\n SELECT 1;;\n')).toBe('SELECT 1')
    expect(normalizeViewQuery("SELECT ';'")).toBe("SELECT ';'")
  })
})
