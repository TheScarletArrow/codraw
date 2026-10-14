import type { Cell, TooltipHandler } from '@maxgraph/core'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'
import { TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from './shapes.ts'
import {
  fitText,
  MAX_COMMENT_WIDTH,
  MAX_TABLE_COMMENT,
  normalizeTableComment,
  TABLE_COMMENT_KEY,
  tableCommentFontSize,
  tableCommentOf,
  tableCommentRoom,
} from './tableComments.ts'

/** Every letter is 6 pixels wide, as if measured. */
const measure = (text: string) => text.length * 6

describe('the text of a comment', () => {
  it('is one line without spaces at its ends, every run of spaces as one, not too long', () => {
    expect(normalizeTableComment('  Клиенты\n  магазина\t и  гости ')).toBe('Клиенты магазина и гости')
    expect(normalizeTableComment(' \n ')).toBe('')
    expect(normalizeTableComment('x'.repeat(MAX_TABLE_COMMENT + 10))).toHaveLength(MAX_TABLE_COMMENT)
  })

  it('is read from the style, and is empty for what is not one', () => {
    expect(tableCommentOf({ [TABLE_COMMENT_KEY]: 'Заказы' })).toBe('Заказы')
    expect(tableCommentOf({})).toBe('')
    expect(tableCommentOf({ [TABLE_COMMENT_KEY]: 1 })).toBe('')
    expect(tableCommentOf({ [TABLE_COMMENT_KEY]: 'x'.repeat(MAX_TABLE_COMMENT + 1) })).toBe('')
  })

  it('is smaller than the name, and takes a line of its size under it', () => {
    expect(tableCommentFontSize(13)).toBe(10)
    expect(tableCommentFontSize(8)).toBe(9)
    expect(tableCommentFontSize(20)).toBe(16)
    expect(tableCommentRoom(13)).toBe(16)
    expect(tableCommentRoom(20)).toBeGreaterThan(tableCommentRoom(13))
  })

  it('is cut with «…» to the width it has', () => {
    expect(fitText('Заказы', 36, measure)).toBe('Заказы')
    expect(fitText('Заказы клиентов', 48, measure)).toBe('Заказы…')
    expect(fitText('Заказы клиентов', 60, measure)).toBe('Заказы кл…')
    expect(fitText('Заказы', 6, measure)).toBe('…')
    expect(fitText('Заказы', 5, measure)).toBe('')
  })
})

describe('the comment of a table', () => {
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

  function openTable(doc?: Y.Doc) {
    const editor = open(doc)
    const builder = new DiagramBuilder()
    builder.table('accounts', 0, 0, ['id uuid PK', 'email text NOT NULL'], 220, ['accounts_email_idx (email)'])
    editor.insertCells(builder.build())
    return { editor, table: tableOf(editor, 'accounts') }
  }

  const tableOf = (editor: DiagramEditor, name: string) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => cell.getValue() === name)!
  const style = (cell: Cell) => cell.getStyle() as Record<string, unknown>
  const tops = (table: Cell) => table.getChildren().map((row) => row.getGeometry()!.y)
  const comment = (editor: DiagramEditor, table: Cell, text: string) => {
    editor.graph.setSelectionCell(table)
    editor.setTableComment(text)
  }
  const room = tableCommentRoom(13)

  it('lies under the name, moving the rows down by its line, as one undo step', () => {
    const { editor, table } = openTable()
    const before = { tops: tops(table), height: table.getGeometry()!.height }

    comment(editor, table, '  Клиенты\nмагазина ')

    expect(tableCommentOf(style(table))).toBe('Клиенты магазина')
    expect(editor.getState().tableComment).toBe('Клиенты магазина')
    expect(tops(table)).toEqual(before.tops.map((top) => top + room))
    expect(table.getGeometry()!.height).toBe(before.height + room)
    // The stored header does not change: the line is added where the table is drawn.
    expect(style(table).startSize).toBe(TABLE_HEADER_HEIGHT)
    const drawn = editor.graph.getCellStyle(table)
    expect(drawn.startSize).toBe(TABLE_HEADER_HEIGHT + room)
    expect(drawn.spacingBottom).toBe(room)

    editor.undo()
    expect(style(table)).not.toHaveProperty(TABLE_COMMENT_KEY)
    expect(tops(table)).toEqual(before.tops)
    expect(table.getGeometry()!.height).toBe(before.height)
  })

  it('is shown for a field or an index of its table, and removed when emptied', () => {
    const { editor, table } = openTable()
    comment(editor, table, 'Клиенты')

    editor.graph.setSelectionCell(table.getChildAt(1))
    expect(editor.getState().tableComment).toBe('Клиенты')
    editor.graph.setSelectionCell(table.getChildAt(2))
    expect(editor.getState().tableComment).toBe('Клиенты')
    editor.setTableComment('   ')
    expect(style(table)).not.toHaveProperty(TABLE_COMMENT_KEY)
    expect(tops(table)[0]).toBe(TABLE_HEADER_HEIGHT)
    editor.graph.clearSelection()
    expect(editor.getState().tableComment).toBeNull()
  })

  it('keeps its line when the text of the table gets larger', () => {
    const { editor, table } = openTable()
    comment(editor, table, 'Клиенты')

    editor.graph.setSelectionCell(table)
    editor.setFontSize(20)

    const header = Number(style(table).startSize)
    expect(tops(table)[0]).toBe(header + tableCommentRoom(20))
  })

  it('comes to the other participants', () => {
    const doc = new Y.Doc()
    const other = new Y.Doc()
    doc.on('update', (update: Uint8Array) => Y.applyUpdate(other, update))
    const { editor, table } = openTable(doc)
    const viewer = open(other, true)

    comment(editor, table, 'Клиенты магазина')

    const seen = tableOf(viewer, 'accounts')
    expect(tableCommentOf(style(seen))).toBe('Клиенты магазина')
    expect(viewer.graph.getCellStyle(seen).startSize).toBe(TABLE_HEADER_HEIGHT + room)
    expect(tops(seen)[0]).toBe(TABLE_HEADER_HEIGHT + room)
  })

  it('changes neither in a read-only editor nor on a locked table', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const builder = new DiagramBuilder()
    builder.table('accounts', 0, 0, ['id uuid PK'])
    const editor = open(doc)
    editor.insertCells(builder.build())
    const viewer = open(doc, true)

    comment(viewer, tableOf(viewer, 'accounts'), 'Клиенты')
    expect(tableCommentOf(style(tableOf(editor, 'accounts')))).toBe('')

    const table = tableOf(editor, 'accounts')
    editor.graph.setSelectionCell(table)
    editor.setLocked(true)
    editor.setTableComment('Клиенты')
    expect(tableCommentOf(style(table))).toBe('')
  })

  it('is not passed by a base table to the tables that inherit it', () => {
    const editor = open()
    const builder = new DiagramBuilder()
    builder.table('BaseEntity', 0, 0, ['id uuid PK'])
    builder.table('users', 300, 0, ['email text'])
    editor.insertCells(builder.build())
    const base = tableOf(editor, 'BaseEntity')
    const users = tableOf(editor, 'users')
    editor.graph.setSelectionCell(base)
    editor.setBaseTable(true)
    editor.setTableComment('Общие поля сущностей')
    editor.graph.setSelectionCell(users)
    editor.setTableBase(base.getId())

    expect(users.getChildren().map((field) => field.getValue())).toEqual(['id uuid PK', 'email text'])
    expect(tableCommentOf(style(users))).toBe('')
    expect(tops(users)[0]).toBe(TABLE_HEADER_HEIGHT)
  })

  it('is placed under the name by a table built with it', () => {
    const builder = new DiagramBuilder()
    const built = builder.table('accounts', 0, 0, ['id uuid PK'], 220, [], { [TABLE_COMMENT_KEY]: 'Клиенты' })
    const cells = builder.build()

    const table = cells.find((cell) => cell.id === built.id)!
    expect(cells.find((cell) => cell.id === built.fields[0])!.geometry!.y).toBe(TABLE_HEADER_HEIGHT + room)
    expect(table.geometry!.height).toBe(TABLE_HEADER_HEIGHT + room + TABLE_FIELD_HEIGHT)
  })

  describe('with text measured', () => {
    // jsdom measures no text: every letter is 6 pixels wide.
    beforeAll(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        measureText: (text: string) => ({ width: measure(text) }),
      } as unknown as CanvasRenderingContext2D)
    })
    afterAll(() => vi.restoreAllMocks())

    const tooltip = (editor: DiagramEditor, of: Cell) => {
      const tooltips = editor.graph.getPlugin<TooltipHandler>('TooltipHandler')!
      const state = editor.graph.getView().getState(of)!
      const tip = tooltips.getTooltip(state, state.shape!.node, 0, 0)
      return tip instanceof HTMLElement ? tip.textContent : tip
    }

    it('widens a table with auto width up to a limit, and shows a cut comment whole in the tooltip', () => {
      const { editor, table } = openTable()
      editor.graph.setSelectionCell(table)
      editor.setAutoWidth(true)
      const width = table.getGeometry()!.width

      comment(editor, table, 'Клиенты')
      expect(table.getGeometry()!.width).toBe(width)
      editor.graph.clearSelection()
      expect(tooltip(editor, table) ?? '').not.toContain('Клиенты')

      const long = 'Клиенты магазина: покупатели, у которых есть хотя бы один заказ, и гости с корзиной'
      comment(editor, table, long)
      expect(table.getGeometry()!.width).toBe(MAX_COMMENT_WIDTH)
      editor.graph.clearSelection()
      expect(tooltip(editor, table)).toContain(long)
    })
  })
})
