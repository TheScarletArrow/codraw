import { Geometry, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { EDGE_API_KEY, emptyEdgeApi, parseEdgeApi, type EdgeApi } from './edgeApi.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { connect } from './testing.ts'

const ORDERS: EdgeApi = { ...emptyEdgeApi(), method: 'GET', path: '/orders' }
const ORDER: EdgeApi = { ...ORDERS, path: '/orders/{id}' }

describe('descriptions of calls of edges in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса' })
    editors.push(editor)
    return { doc, editor }
  }

  function edge(editor: DiagramEditor, label = ''): Cell {
    const shape = (x: number) => {
      const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
      editor.graph.getDataModel().setGeometry(cell, new Geometry(x, 100, 120, 60))
      return cell
    }
    const [a, b] = [shape(100), shape(400)]
    const cell = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: label, source: a, target: b })
    editor.graph.setSelectionCell(cell)
    return cell
  }

  const stored = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!)

  it('sets and removes the description of the selected edge, each as one undo step that every participant sees', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const cell = edge(editor)
    const theirs = () => other.editor.graph.getDataModel().getCell(cell.getId()!)!
    expect(editor.getState().edgeApi).toEqual({ cellId: cell.getId(), api: null, canChange: true })

    editor.setEdgeApi(ORDERS)
    expect(parseEdgeApi(stored(doc, cell).style[EDGE_API_KEY])).toEqual(ORDERS)
    expect(parseEdgeApi((theirs().getStyle() as Record<string, unknown>)[EDGE_API_KEY])).toEqual(ORDERS)
    expect(editor.getState().edgeApi).toEqual({ cellId: cell.getId(), api: ORDERS, canChange: true })
    expect(theirs().getValue()).toBe('GET /orders')

    editor.setEdgeApi(null)
    expect(stored(doc, cell).style).not.toHaveProperty(EDGE_API_KEY)
    // The label stays.
    expect(cell.getValue()).toBe('GET /orders')

    editor.undo()
    expect(editor.getState().edgeApi?.api).toEqual(ORDERS)
    editor.undo()
    expect(stored(doc, cell).style).not.toHaveProperty(EDGE_API_KEY)
    expect(stored(doc, cell).value).toBe('')
    editor.redo()
    expect(stored(doc, cell).value).toBe('GET /orders')
  })

  it('makes the label follow the call until someone writes their own', () => {
    const { editor } = open()
    const cell = edge(editor)
    editor.setEdgeApi(ORDERS)
    editor.setEdgeApi(ORDER)
    expect(cell.getValue()).toBe('GET /orders/{id}')

    editor.graph.getDataModel().setValue(cell, 'заказ')
    editor.setEdgeApi({ ...ORDER, method: 'DELETE' })
    expect(cell.getValue()).toBe('заказ')

    const own = edge(editor, 'оплата')
    editor.setEdgeApi({ ...ORDERS, method: 'POST', path: '/payments' })
    expect(own.getValue()).toBe('оплата')
  })

  it('describes single edges only, and changes neither a locked edge nor one of a participant who may only view', () => {
    const { doc, editor } = open()
    const cell = edge(editor)
    const shape = cell.getTerminal(true)!
    editor.graph.setSelectionCell(shape)
    editor.setEdgeApi(ORDERS)
    expect(shape.getStyle()).not.toHaveProperty(EDGE_API_KEY)
    expect(editor.getState().edgeApi).toBeNull()

    editor.graph.setSelectionCell(cell)
    editor.setLocked(true)
    editor.setEdgeApi(ORDERS)
    expect(cell.getStyle()).not.toHaveProperty(EDGE_API_KEY)
    expect(editor.getState().edgeApi).toEqual({ cellId: cell.getId(), api: null, canChange: false })
    editor.setLocked(false)
    editor.setEdgeApi(ORDERS)

    const viewer = open({ doc, readOnly: true })
    const seen = viewer.editor.graph.getDataModel().getCell(cell.getId()!)!
    viewer.editor.graph.setSelectionCell(seen)
    expect(viewer.editor.getState().edgeApi).toEqual({ cellId: cell.getId(), api: ORDERS, canChange: false })
    viewer.editor.setEdgeApi(null)
    expect(parseEdgeApi(stored(doc, cell).style[EDGE_API_KEY])).toEqual(ORDERS)
  })

  it('shows no description that it cannot read', () => {
    const { editor } = open()
    const cell = edge(editor)
    editor.graph.getDataModel().setStyle(cell, { ...cell.getStyle(), [EDGE_API_KEY]: '{"v":1,"method":"BREW"}' } as never)
    expect(editor.getState().edgeApi?.api).toBeNull()
  })
})
