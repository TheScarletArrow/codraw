import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { PLAN_COLORS, PLAN_KEY } from './plan.ts'
import { connect } from './testing.ts'

describe('the current and the target architecture in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса', participantId: 'alice' })
    editors.push(editor)
    return { doc, editor }
  }

  const drawn = (editor: DiagramEditor, cell: Cell) => editor.graph.getCellStyle(cell)
  const shown = (editor: DiagramEditor, cell: Cell) => editor.graph.getView().getState(cell) !== null
  const stored = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!).style[PLAN_KEY]

  /** API → Ledger → DB: Ledger will appear with its edges, DB will go. */
  function page(editor: DiagramEditor) {
    const api = editor.addShape('service', { x: 0, y: 0 })!
    const ledger = editor.addShape('service', { x: 300, y: 0 })!
    const db = editor.addShape('database', { x: 600, y: 0 })!
    const graph = editor.graph
    const toLedger = graph.insertEdge({ parent: graph.getDefaultParent(), source: api, target: ledger })
    const toDb = graph.insertEdge({ parent: graph.getDefaultParent(), source: ledger, target: db })
    graph.setSelectionCells([ledger, toLedger])
    editor.setPlan('added')
    graph.setSelectionCell(db)
    editor.setPlan('removed')
    graph.clearSelection()
    return { api, ledger, db, toLedger, toDb }
  }

  it('marks the selection as one undo step and outlines the difference', () => {
    const { doc, editor } = open()
    const { api, ledger, db, toLedger, toDb } = page(editor)

    expect([stored(doc, ledger), stored(doc, toLedger), stored(doc, db), stored(doc, api)]).toEqual(['added', 'added', 'removed', undefined])
    expect(editor.getState().plan).toEqual({ view: 'diff', added: 2, removed: 1 })
    expect(drawn(editor, ledger)).toMatchObject({ strokeColor: PLAN_COLORS.added, strokeWidth: 2 })
    expect(drawn(editor, db)).toMatchObject({ strokeColor: PLAN_COLORS.removed, dashed: true })
    expect(drawn(editor, toDb).strokeColor).not.toBe(PLAN_COLORS.removed)
    editor.graph.setSelectionCells([ledger, db])
    expect(editor.getState().selectionPlan).toEqual({ value: null, mixed: true })

    editor.undo()
    expect(stored(doc, db)).toBeUndefined()
    expect(drawn(editor, db).strokeColor).not.toBe(PLAN_COLORS.removed)
    expect(stored(doc, ledger)).toBe('added')
  })

  it('shows the page as it is and as it will be for its participant alone, without what is left out and its edges', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const { api, ledger, db, toLedger, toDb } = page(editor)
    const before = Y.encodeStateAsUpdate(doc)

    editor.setPlanView('current')
    expect(editor.getState().plan.view).toBe('current')
    expect([shown(editor, api), shown(editor, ledger), shown(editor, toLedger), shown(editor, toDb), shown(editor, db)]).toEqual([
      true,
      false,
      false,
      false,
      true,
    ])
    // The states draw what they show as it is.
    expect(drawn(editor, db).strokeColor).not.toBe(PLAN_COLORS.removed)
    editor.selectAll()
    expect(editor.graph.getSelectionCells()).toEqual(expect.not.arrayContaining([ledger, toLedger]))

    editor.setPlanView('target')
    expect([shown(editor, ledger), shown(editor, toLedger), shown(editor, toDb), shown(editor, db)]).toEqual([true, true, false, false])
    const theirs = (cell: Cell) => other.editor.graph.getDataModel().getCell(cell.getId()!)!
    expect(shown(other.editor, theirs(db))).toBe(true)
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)

    // The image is of the view.
    expect(editor.exportSvg()!.svg).not.toContain('База данных')
    editor.setPlanView('diff')
    expect(shown(editor, db)).toBe(true)
    expect(editor.exportSvg()!.svg).toContain(PLAN_COLORS.removed)

    // A mark of another participant changes the view.
    editor.setPlanView('target')
    other.editor.graph.setSelectionCell(theirs(api))
    other.editor.setPlan('removed')
    expect(shown(editor, api)).toBe(false)
    expect(editor.getState().plan).toMatchObject({ removed: 2 })
  })

  it('applies the target state as one undo step, and keeps locked elements', () => {
    const { doc, editor } = open()
    const { api, ledger, db, toLedger } = page(editor)
    const kept = editor.addShape('queue', { x: 0, y: 300 })!
    editor.graph.setSelectionCell(kept)
    editor.setPlan('removed')
    editor.setLocked(true)
    editor.graph.clearSelection()

    expect(editor.applyTargetState()).toBe(true)

    const model = editor.graph.getDataModel()
    expect(model.getCell(db.getId()!)).toBeFalsy()
    expect(getCells(doc).has(db.getId()!)).toBe(false)
    expect([stored(doc, ledger), stored(doc, toLedger)]).toEqual([undefined, undefined])
    expect(stored(doc, kept)).toBe('removed')
    expect(model.getCell(api.getId()!)).toBeTruthy()
    expect(editor.getState().plan).toMatchObject({ added: 0, removed: 1 })

    editor.undo()
    expect(getCells(doc).has(db.getId()!)).toBe(true)
    expect(stored(doc, ledger)).toBe('added')
  })

  it('changes nothing for a viewer, who chooses the view', () => {
    const { doc, editor } = open()
    const { ledger } = page(editor)
    const viewer = open({ doc, readOnly: true })
    const theirs = viewer.editor.graph.getDataModel().getCell(ledger.getId()!)!
    viewer.editor.graph.setSelectionCell(theirs)
    viewer.editor.setPlan(null)
    expect(viewer.editor.applyTargetState()).toBe(false)
    expect(stored(doc, ledger)).toBe('added')
    viewer.editor.setPlanView('current')
    expect(shown(viewer.editor, theirs)).toBe(false)
  })
})
