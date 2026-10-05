import { Geometry, Point, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument } from './model.ts'
import type { ShapeId } from './shapes.ts'

describe('auto layout of the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open({ readOnly = false, doc = new Y.Doc() } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { editor, doc }
  }

  function shape(editor: DiagramEditor, x: number, y: number, kind: ShapeId = 'rectangle', width = 120, height = 60): Cell {
    const cell = editor.addShape(kind, { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, y, width, height))
    return cell
  }

  const connect = (editor: DiagramEditor, source: Cell, target: Cell) =>
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source, target })

  const box = (cell: Cell) => {
    const { x, y, width, height } = cell.getGeometry()!
    return { x, y, width, height }
  }

  it('lays out the whole page left to right in one undo step, and the document has it', async () => {
    const { editor, doc } = open()
    const db = shape(editor, 100, 300)
    const client = shape(editor, 400, 100)
    const api = shape(editor, 250, 500)
    connect(editor, client, api)
    connect(editor, api, db)
    editor.graph.clearSelection()
    const before = [client, api, db].map(box)

    await editor.autoLayout('right')

    const [c, a, d] = [client, api, db].map(box)
    expect(c!.x + c!.width).toBeLessThanOrEqual(a!.x)
    expect(a!.x + a!.width).toBeLessThanOrEqual(d!.x)
    expect(Math.min(c!.x, a!.x, d!.x)).toBe(100)
    expect(getCells(doc).get(api.getId()!)!.get('geometry')).toMatchObject({ x: a!.x, y: a!.y })

    editor.undo()
    expect([client, api, db].map(box)).toEqual(before)
  })

  it('lays out top to bottom', async () => {
    const { editor } = open()
    const a = shape(editor, 0, 300)
    const b = shape(editor, 0, 0)
    connect(editor, a, b)

    await editor.autoLayout('down')

    expect(box(a).y + 60).toBeLessThanOrEqual(box(b).y)
  })

  it('lays out only the selection when two shapes or more are selected', async () => {
    const { editor } = open()
    const a = shape(editor, 400, 0)
    const b = shape(editor, 0, 0)
    const untouched = shape(editor, 1000, 1000)
    connect(editor, a, b)
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().layoutSelection).toBe(true)

    await editor.autoLayout('right')

    expect(box(a).x + 120).toBeLessThanOrEqual(box(b).x)
    expect(box(untouched)).toEqual({ x: 1000, y: 1000, width: 120, height: 60 })
  })

  it('moves a table with its fields and counts an edge between fields as an edge of the tables', async () => {
    const { editor } = open()
    const users = shape(editor, 0, 0, 'table', 160, 90)
    const orders = shape(editor, 600, 0, 'table', 160, 90)
    const [userId] = users.getChildren()
    const [orderUserId] = orders.getChildren()
    connect(editor, orderUserId!, userId!)
    const fieldBox = box(orderUserId!)

    await editor.autoLayout('right')

    expect(box(orders).x + box(orders).width).toBeLessThanOrEqual(box(users).x)
    expect(orderUserId!.getParent()).toBe(orders)
    expect(box(orderUserId!)).toEqual(fieldBox)
  })

  it('removes the bends of the edges between the laid out shapes', async () => {
    const { editor } = open()
    const a = shape(editor, 0, 0)
    const b = shape(editor, 300, 300)
    const edge = connect(editor, a, b)
    const bent = edge.getGeometry()!.clone()
    bent.points = [new Point(500, 500)]
    editor.graph.getDataModel().setGeometry(edge, bent)

    await editor.autoLayout('right')

    expect(edge.getGeometry()!.points ?? []).toEqual([])
  })

  it('keeps the shapes of a frame inside it and resizes the frame', async () => {
    const { editor } = open()
    const cluster = shape(editor, 500, 0, 'kubernetes-cluster', 300, 600)
    const pods = [shape(editor, 560, 100), shape(editor, 560, 250), shape(editor, 560, 400)]
    const balancer = shape(editor, 0, 200)
    connect(editor, balancer, pods[0]!)
    connect(editor, pods[0]!, pods[1]!)
    editor.graph.clearSelection()

    await editor.autoLayout('right')

    const frame = box(cluster)
    for (const pod of pods.map(box)) {
      expect(pod.x).toBeGreaterThanOrEqual(frame.x)
      expect(pod.x + pod.width).toBeLessThanOrEqual(frame.x + frame.width)
      expect(pod.y).toBeGreaterThanOrEqual(frame.y)
      expect(pod.y + pod.height).toBeLessThanOrEqual(frame.y + frame.height)
    }
    const outside = box(balancer)
    expect(outside.x + outside.width <= frame.x || outside.x >= frame.x + frame.width).toBe(true)
  })

  it('does nothing for a participant who may only view', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const writer = open({ doc }).editor
    const a = shape(writer, 300, 0)
    const b = shape(writer, 0, 0)
    connect(writer, a, b)
    const { editor: viewer } = open({ readOnly: true, doc })
    const before = box(viewer.graph.getDataModel().getCell(a.getId()!)!)

    await viewer.autoLayout('right')

    expect(box(viewer.graph.getDataModel().getCell(a.getId()!)!)).toEqual(before)
  })
})
