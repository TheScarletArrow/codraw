import type { Cell, CellStyle } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { IMPACT_COLORS } from './impactView.ts'
import { initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('impact analysis in the editor', () => {
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
  const link = (editor: DiagramEditor, source: Cell, target: Cell, style: CellStyle = {}) =>
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), source, target, style })

  /** Browser → API → Ledger → DB, and a sticky. */
  function chain(editor: DiagramEditor) {
    const web = editor.addShape('browser', { x: 0, y: 0 })!
    const api = editor.addShape('service', { x: 200, y: 0 })!
    const ledger = editor.addShape('service', { x: 400, y: 0 })!
    const db = editor.addShape('database', { x: 600, y: 0 })!
    const e1 = link(editor, web, api)
    const e2 = link(editor, api, ledger)
    const e3 = link(editor, ledger, db)
    const note = editor.addSticky({ x: 0, y: 300 })!
    editor.graph.clearSelection()
    return { web, api, ledger, db, e1, e2, e3, note }
  }

  it('outlines what an element depends on and what depends on it, and draws the rest pale', () => {
    const { doc, editor } = open()
    const { web, api, ledger, db, e1, e2, e3, note } = chain(editor)
    const before = Y.encodeStateAsUpdate(doc)

    expect(editor.showDependencies(api.getId()!)).toBe(true)

    expect(editor.getState().impact).toEqual({ mode: 'dependencies', cellId: api.getId(), depth: 1, dependencies: 1, dependents: 1 })
    expect(drawn(editor, api).strokeColor).toBe(IMPACT_COLORS.focus)
    expect(drawn(editor, ledger).strokeColor).toBe(IMPACT_COLORS.dependency)
    expect(drawn(editor, e2).strokeColor).toBe(IMPACT_COLORS.dependency)
    expect(drawn(editor, web).strokeColor).toBe(IMPACT_COLORS.dependent)
    expect(drawn(editor, e1).strokeColor).toBe(IMPACT_COLORS.dependent)
    expect(drawn(editor, db).opacity).toBe(25)
    expect(drawn(editor, e3).opacity).toBe(25)
    expect(drawn(editor, note).opacity).toBe(25)
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)

    editor.showDependencies(api.getId()!, 'all')
    expect(drawn(editor, db).strokeColor).toBe(IMPACT_COLORS.dependency)
    expect(editor.getState().impact).toMatchObject({ dependencies: 2, depth: 'all' })

    editor.clearImpact()
    expect(editor.getState().impact).toBeNull()
    expect(drawn(editor, db).opacity ?? 100).toBe(100)
    expect(drawn(editor, api).strokeColor).not.toBe(IMPACT_COLORS.focus)
  })

  it('follows the changes of the page and ends when its element is gone', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const { api, db } = chain(editor)
    editor.showDependencies(api.getId()!)
    expect(drawn(editor, db).opacity).toBe(25)

    const theirs = (id: string) => other.editor.graph.getDataModel().getCell(id)!
    link(other.editor, theirs(api.getId()!), theirs(db.getId()!))
    expect(drawn(editor, db).strokeColor).toBe(IMPACT_COLORS.dependency)
    expect(editor.getState().impact).toMatchObject({ dependencies: 2 })
    // The other participant sees nothing of it.
    expect(drawn(other.editor, theirs(db.getId()!)).strokeColor).not.toBe(IMPACT_COLORS.dependency)

    other.editor.graph.removeCells([theirs(api.getId()!)])
    expect(editor.getState().impact).toBeNull()
  })

  it('shows the shortest path between the two selected elements', () => {
    const { editor } = open()
    const { web, api, ledger, db, e1, e2, e3, note } = chain(editor)
    editor.graph.setSelectionCells([web, db])
    expect(editor.canShowPath()).toBe(true)

    expect(editor.showPathBetween()).toBe(true)

    expect(editor.getState().impact).toEqual({ mode: 'path', from: web.getId(), to: db.getId(), steps: 3, directed: true })
    for (const cell of [api, ledger, e1, e2, e3]) expect(drawn(editor, cell).strokeColor).toBe(IMPACT_COLORS.path)
    expect(drawn(editor, web).strokeColor).toBe(IMPACT_COLORS.focus)
    expect(drawn(editor, note).opacity).toBe(25)

    editor.graph.setSelectionCells([web, note])
    expect(editor.canShowPath()).toBe(false)
    const alone = editor.addShape('service', { x: 0, y: 600 })!
    expect(editor.showPathBetween(web.getId()!, alone.getId()!)).toBe(true)
    expect(editor.getState().impact).toMatchObject({ steps: null })
  })

  it('offers the analysis for elements and tables, not for stickies and edges, and leaves it out of images', () => {
    const { editor } = open()
    const { api, e1, note } = chain(editor)
    const table = editor.addShape('table', { x: 0, y: 500 })!
    expect(editor.canAnalyze(api.getId()!)).toBe(true)
    expect(editor.canAnalyze(table.getId()!)).toBe(true)
    expect(editor.canAnalyze(table.getChildAt(0).getId()!)).toBe(true)
    expect(editor.canAnalyze(note.getId()!)).toBe(false)
    expect(editor.canAnalyze(e1.getId()!)).toBe(false)
    expect(editor.showDependencies(e1.getId()!)).toBe(false)

    const plain = editor.exportSvg()!.svg
    editor.showDependencies(api.getId()!)
    expect(editor.exportSvg()!.svg).toBe(plain)
    expect(drawn(editor, note).opacity).toBe(25)
  })

  it('works for a viewer too', () => {
    const { doc, editor } = open()
    const { api } = chain(editor)
    const viewer = open({ doc, readOnly: true })
    expect(viewer.editor.showDependencies(api.getId()!)).toBe(true)
    expect(viewer.editor.getState().impact).toMatchObject({ dependencies: 1, dependents: 1 })
  })
})
