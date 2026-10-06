import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'
import { TABLE_INDEX_GAP } from './shapes.ts'
import { isIndexRow, tableRowsOf } from './tableShapes.ts'

describe('indexes of tables', () => {
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

  /** `users (id uuid PK, org_id uuid, email text)` with the index `users_org_idx (org_id)`. */
  function openUsers(doc?: Y.Doc) {
    const editor = open(doc)
    const builder = new DiagramBuilder()
    builder.table('users', 0, 0, ['id uuid PK', 'org_id uuid', 'email text'], 300, ['users_org_idx (org_id)'])
    editor.insertCells(builder.build())
    return { editor, users: tableOf(editor, 'users') }
  }

  const tableOf = (editor: DiagramEditor, name: string) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => cell.getValue() === name)!
  const rows = (table: Cell) => table.getChildren().filter((cell) => cell.isVertex())
  const texts = (table: Cell) => rows(table).map((row) => row.getValue())
  const indexes = (table: Cell) => rows(table).filter(isIndexRow)
  const select = (editor: DiagramEditor, cell: Cell) => editor.graph.setSelectionCell(cell)

  it('stacks the indexes under the fields, below the room for their caption, and draws the caption', () => {
    const { editor, users } = openUsers()

    expect(rows(users).map((row) => row.getGeometry()!.y)).toEqual([30, 56, 82, 108 + TABLE_INDEX_GAP])
    expect(users.getGeometry()!.height).toBe(134 + TABLE_INDEX_GAP)
    expect(editor.graph.getView().getState(users)!.shape!.node.textContent).toContain('Индексы')
  })

  it('shows the name of an index as its label and its columns after it, and marks the indexed field', () => {
    const { editor, users } = openUsers()
    const [index] = indexes(users)

    expect(editor.graph.getLabel(index!)).toBe('users_org_idx')
    expect(editor.graph.getCellStyle(index!).shape).toBe('codraw.tableField')
    expect(tableRowsOf(editor.graph, users).get(index!)).toMatchObject({ icons: ['index'], columns: [{ text: '(org_id)' }] })
    expect(tableRowsOf(editor.graph, users).get(users.getChildAt(1))!.icons).toEqual(['index'])
    expect(tableRowsOf(editor.graph, users).get(users.getChildAt(2))!.icons).toEqual([])
  })

  it('adds an index at the end of the block, or after the selected index, and starts editing its name', () => {
    const { editor, users } = openUsers()
    select(editor, users)
    const added = editor.addTableIndex()!

    expect(isIndexRow(added)).toBe(true)
    expect(indexes(users)).toEqual([users.getChildAt(3), added])
    expect(editor.graph.isEditing(added)).toBe(true)
    editor.graph.stopEditing(true)
    editor.graph.labelChanged(added, 'users_email_idx (email)', null as never)
    expect(texts(users).at(-1)).toBe('users_email_idx (email)')
    expect(added.getGeometry()!.y).toBe(134 + TABLE_INDEX_GAP)

    select(editor, users.getChildAt(3))
    const between = editor.addTableIndex()!
    expect(indexes(users)).toEqual([users.getChildAt(3), between, added])
  })

  it('removes an added index and its block with one undo step', () => {
    const editor = open()
    const builder = new DiagramBuilder()
    builder.table('users', 0, 0, ['id uuid PK'])
    editor.insertCells(builder.build())
    const users = tableOf(editor, 'users')
    select(editor, users)
    editor.addTableIndex()
    editor.graph.stopEditing(true)

    expect(users.getGeometry()!.height).toBe(56 + TABLE_INDEX_GAP + 26)
    editor.undo()
    const undone = tableOf(editor, 'users')
    expect(indexes(undone)).toEqual([])
    expect(undone.getGeometry()!.height).toBe(56)
    expect(editor.graph.getView().getState(undone)!.shape!.node.textContent).not.toContain('Индексы')
  })

  it('adds a field before the indexes when the table or an index is selected', () => {
    const { editor, users } = openUsers()
    select(editor, indexes(users)[0]!)
    const field = editor.addTableField()!

    expect(users.getIndex(field)).toBe(3)
    expect(isIndexRow(users.getChildAt(4))).toBe(true)
  })

  it('edits the name of an index and keeps its columns, or takes a whole index', () => {
    const { editor, users } = openUsers()
    const [index] = indexes(users)

    expect(editor.graph.getEditingValue(index!, null as never)).toBe('users_org_idx')
    editor.graph.labelChanged(index!, 'users_org_id_idx', null as never)
    expect(index!.getValue()).toBe('users_org_id_idx (org_id)')
    editor.graph.labelChanged(index!, 'users_org_idx (org_id) WHERE email IS NOT NULL', null as never)
    expect(index!.getValue()).toBe('users_org_idx (org_id) WHERE email IS NOT NULL')
  })

  it('sets the columns and the uniqueness of the selected index, each as one undo step', () => {
    const { editor, users } = openUsers()
    const [index] = indexes(users)
    select(editor, index!)

    expect(editor.getState().index).toEqual({ cellId: index!.getId(), tableId: users.getId(), columns: 'org_id', unique: false })
    expect(editor.getState().field).toBeNull()
    editor.setIndexProps({ columns: ' org_id, email ' })
    editor.setIndexProps({ unique: true })

    expect(index!.getValue()).toBe('users_org_idx (org_id, email) UNIQUE')
    expect(tableRowsOf(editor.graph, users).get(users.getChildAt(2))!.icons).toEqual(['index'])
    expect(tableRowsOf(editor.graph, users).get(index!)!.icons).toEqual(['unique'])
    editor.undo()
    expect(index!.getValue()).toBe('users_org_idx (org_id, email)')
  })

  it('gives an index typed as a name alone its columns', () => {
    const { editor, users } = openUsers()
    select(editor, users)
    const added = editor.addTableIndex()!
    editor.graph.stopEditing(true)
    editor.graph.labelChanged(added, 'users_email_idx', null as never)
    select(editor, added)

    expect(editor.getState().index).toMatchObject({ columns: '', unique: false })
    editor.setIndexProps({ columns: 'email' })
    expect(added.getValue()).toBe('users_email_idx (email)')
  })

  it('renames a field in the indexes of its table, in the same undo step', () => {
    const { editor, users } = openUsers()
    const field = users.getChildAt(1)
    editor.graph.labelChanged(field, 'team_id', null as never)

    expect(texts(users)).toEqual(['id uuid PK', 'team_id uuid', 'email text', 'users_org_idx (team_id)'])
    editor.undo()
    expect(texts(users)).toEqual(['id uuid PK', 'org_id uuid', 'email text', 'users_org_idx (org_id)'])
  })

  it('takes no edges to indexes', () => {
    const { editor, users } = openUsers()

    expect(editor.graph.isValidSource(indexes(users)[0]!)).toBe(false)
    expect(editor.graph.isValidTarget(indexes(users)[0]!)).toBe(false)
    expect(editor.graph.isValidTarget(users.getChildAt(1))).toBe(true)
  })

  it('brings the indexes to the other participants, who cannot change them', () => {
    const doc = new Y.Doc()
    const other = new Y.Doc()
    doc.on('update', (update: Uint8Array) => Y.applyUpdate(other, update))
    const { editor, users } = openUsers(doc)
    const viewer = open(other, true)
    select(editor, indexes(users)[0]!)
    editor.setIndexProps({ unique: true })

    const seen = tableOf(viewer, 'users')
    expect(indexes(seen).map((row) => row.getValue())).toEqual(['users_org_idx (org_id) UNIQUE'])
    expect(rows(seen).map((row) => row.getGeometry()!.y)).toEqual([30, 56, 82, 108 + TABLE_INDEX_GAP])
    select(viewer, seen)
    expect(viewer.addTableIndex()).toBeNull()
    select(viewer, indexes(seen)[0]!)
    viewer.setIndexProps({ unique: false })
    expect(indexes(seen)[0]!.getValue()).toBe('users_org_idx (org_id) UNIQUE')
  })

  it('leaves the indexes of a base table to it', () => {
    const { editor, users } = openUsers()
    const builder = new DiagramBuilder()
    builder.table('BaseEntity', 400, 0, ['created_at timestamptz'], 300, ['base_created_idx (created_at)'])
    editor.insertCells(builder.build())
    const base = tableOf(editor, 'BaseEntity')
    select(editor, base)
    editor.setBaseTable(true)
    select(editor, users)
    editor.setTableBase(base.getId())

    expect(texts(users)).toEqual(['created_at timestamptz', 'id uuid PK', 'org_id uuid', 'email text', 'users_org_idx (org_id)'])
    expect(tableRowsOf(editor.graph, users).get(users.getChildAt(0))!.icons).toEqual([])
  })
})
