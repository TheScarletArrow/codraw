import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { readAttribution, type Author } from './attribution.ts'
import { createUndoManager } from './binding.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument } from './model.ts'
import { readStatus } from './status.ts'
import { connect } from './testing.ts'

const ALICE: Author = { id: '0199a000-0000-7000-8000-00000000000a', name: 'Алиса' }
const BOB: Author = { id: '0199a000-0000-7000-8000-00000000000b', name: 'Боб' }
const T0 = Date.UTC(2026, 9, 7, 9, 0, 0)
const MINUTE = 60_000

describe('statuses of elements in the editor', () => {
  const editors: DiagramEditor[] = []
  const histories: Y.UndoManager[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    histories.splice(0).forEach((history) => history.destroy())
    vi.restoreAllMocks()
  })

  function open({ participant = ALICE, doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const history = createUndoManager(getCells(doc))
    const editor = createDiagramEditor(container, doc, {
      readOnly,
      participantName: participant.name,
      participantId: participant.id,
      undoManager: history,
    })
    editors.push(editor)
    histories.push(history)
    return { doc, editor, history }
  }

  /** Changes of the participants from now on happen at `time`. */
  const at = (time: number) => vi.spyOn(Date, 'now').mockReturnValue(time)
  const statusOf = (doc: Y.Doc, cell: Cell) => readStatus(getCells(doc).get(cell.getId()!))
  const select = (editor: DiagramEditor, ...cells: Cell[]) => editor.graph.setSelectionCells(cells)

  it('sets the status of the selected shapes, tables and groups in one undo step, and the other participant gets it', () => {
    const { doc, editor } = open()
    const bob = open({ participant: BOB })
    connect(doc, bob.doc)
    const api = editor.addShape('rectangle', { x: 100, y: 100 })!
    const worker = editor.addShape('rectangle', { x: 300, y: 100 })!
    const table = editor.addShape('table', { x: 500, y: 100 })!
    at(T0)

    select(editor, api, worker, table)
    expect(editor.getState().status).toEqual({ value: null, mixed: false })
    const changed = editor.setStatus('done')

    expect(changed).toEqual([api, worker, table].map((cell) => cell.getId()))
    for (const cell of [api, worker, table]) {
      expect(statusOf(bob.doc, cell)).toEqual({ status: 'done', by: ALICE.id, name: 'Алиса', at: T0 })
    }
    expect(editor.getState().status).toEqual({ value: 'done', mixed: false })

    editor.undo()

    for (const cell of [api, worker, table]) expect(statusOf(bob.doc, cell)).toBeNull()
    expect(editor.getState().status).toEqual({ value: null, mixed: false })
    editor.redo()
    expect(statusOf(bob.doc, table)?.status).toBe('done')
  })

  it('brings back the previous status with who set it and when on undo', () => {
    const { doc, editor } = open()
    const bob = open({ participant: BOB })
    connect(doc, bob.doc)
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    const theirs = bob.editor.graph.getDataModel().getCell(cell.getId()!)!
    at(T0)
    select(bob.editor, theirs)
    bob.editor.setStatus('review')

    at(T0 + MINUTE)
    select(editor, cell)
    expect(editor.getState().status).toEqual({ value: 'review', mixed: false })
    editor.setStatus('done')
    expect(statusOf(doc, cell)).toEqual({ status: 'done', by: ALICE.id, name: 'Алиса', at: T0 + MINUTE })

    editor.undo()

    expect(statusOf(doc, cell)).toEqual({ status: 'review', by: BOB.id, name: 'Боб', at: T0 })
    expect(statusOf(bob.doc, cell)).toEqual({ status: 'review', by: BOB.id, name: 'Боб', at: T0 })
  })

  it('leaves the elements that have the status already, and adds no undo step without a change', () => {
    const { doc, editor, history } = open()
    const first = editor.addShape('rectangle', { x: 100, y: 100 })!
    const second = editor.addShape('rectangle', { x: 300, y: 100 })!
    at(T0)
    select(editor, first)
    editor.setStatus('review')

    at(T0 + MINUTE)
    select(editor, first, second)
    expect(editor.getState().status).toEqual({ value: null, mixed: true })
    expect(editor.setStatus('review')).toEqual([second.getId()])
    expect(statusOf(doc, first)?.at).toBe(T0)

    const steps = history.undoStack.length
    expect(editor.setStatus('review')).toEqual([])
    expect(history.undoStack.length).toBe(steps)
  })

  it('takes the status off, and the status does not change who changed the element last', () => {
    const { doc, editor } = open()
    at(T0)
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    const bob = open({ participant: BOB })
    connect(doc, bob.doc)
    const theirs = bob.editor.graph.getDataModel().getCell(cell.getId()!)!
    at(T0 + MINUTE)
    select(bob.editor, theirs)

    bob.editor.setStatus('draft')
    expect(readAttribution(getCells(doc).get(cell.getId()!))).toEqual({ by: ALICE.id, name: 'Алиса', at: T0 })
    bob.editor.setStatus(null)

    expect(statusOf(doc, cell)).toBeNull()
    expect(bob.editor.getState().status).toEqual({ value: null, mixed: false })
  })

  it('sets the status of the table of a selected field, of locked elements, and none of edges', () => {
    const { doc, editor } = open()
    const table = editor.addShape('table', { x: 100, y: 100 })!
    const field = table.getChildAt(0)
    const api = editor.addShape('rectangle', { x: 400, y: 100 })!
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: api, target: table })
    select(editor, api)
    editor.setLocked(true)

    select(editor, field, api, edge)
    expect(editor.setStatus('draft')).toEqual([table.getId(), api.getId()])

    expect(statusOf(doc, table)?.status).toBe('draft')
    expect(statusOf(doc, field)).toBeNull()
    expect(statusOf(doc, api)?.status).toBe('draft')
    expect(statusOf(doc, edge)).toBeNull()

    select(editor, edge)
    expect(editor.getState().status).toBeNull()
    expect(editor.setStatus('done')).toEqual([])
  })

  it('follows a status that another participant sets on the selection', () => {
    const { doc, editor } = open()
    const bob = open({ participant: BOB })
    connect(doc, bob.doc)
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    select(editor, cell)
    const listener = vi.fn()
    editor.subscribe(listener)

    select(bob.editor, bob.editor.graph.getDataModel().getCell(cell.getId()!)!)
    bob.editor.setStatus('review')

    expect(listener).toHaveBeenCalled()
    expect(editor.getState().status).toEqual({ value: 'review', mixed: false })
  })

  it('gives copies no status', () => {
    const { doc, editor } = open()
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    select(editor, cell)
    editor.setStatus('done')

    editor.duplicate()

    const copy = editor.graph.getSelectionCell()
    expect(copy).not.toBe(cell)
    expect(statusOf(doc, copy)).toBeNull()
    expect(statusOf(doc, cell)?.status).toBe('done')
  })

  it('changes no status in a read-only editor', () => {
    const { doc, editor } = open()
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    select(editor, cell)
    editor.setStatus('review')
    const viewer = open({ doc, readOnly: true })
    const theirs = viewer.editor.graph.getDataModel().getCell(cell.getId()!)!
    select(viewer.editor, theirs)
    const before = Y.encodeStateVector(doc)

    expect(viewer.editor.getState().status).toEqual({ value: 'review', mixed: false })
    expect(viewer.editor.setStatus('done')).toEqual([])
    expect(Y.encodeStateVector(doc)).toEqual(before)
  })
})
