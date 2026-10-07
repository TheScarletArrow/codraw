import { Geometry, InternalMouseEvent, type Cell, type SelectionCellsHandler, type VertexHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { connect } from './testing.ts'

describe('turning shapes', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса' })
    editors.push(editor)
    return { doc, editor }
  }

  function shape(editor: DiagramEditor, x: number, y: number): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, y, 120, 60))
    return cell
  }

  const storedStyle = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!).style
  const handlerOf = (editor: DiagramEditor, cell: Cell) =>
    editor.graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')!.getHandler(cell) as VertexHandler

  /**
   * Drags the handle that turns the selected `cell` around its centre until it points at `angle` degrees, with Alt held
   * after the press if `altKey`.
   */
  function dragRotationHandle(editor: DiagramEditor, cell: Cell, angle: number, altKey = false) {
    const handler = handlerOf(editor, cell)
    const handle = handler.rotationShape!.bounds!
    const [centerX, centerY] = [handler.state.getCenterX(), handler.state.getCenterY()]
    const event = (type: string, x: number, y: number) => {
      const me = new InternalMouseEvent(new MouseEvent(type, { altKey: altKey && type !== 'mousedown' }))
      me.graphX = x
      me.graphY = y
      return me
    }
    // The handle points at the rotation of the shape from where it is when the shape is not turned.
    const unturned = handler.getRotationHandlePosition()
    const radius = Math.hypot(unturned.x - centerX, unturned.y - centerY)
    const radians = Math.atan2(unturned.x - centerX, centerY - unturned.y) + (angle * Math.PI) / 180
    const [x, y] = [centerX + radius * Math.sin(radians), centerY - radius * Math.cos(radians)]

    handler.mouseDown(editor.graph, event('mousedown', handle.getCenterX(), handle.getCenterY()))
    handler.mouseMove(editor.graph, event('mousemove', x, y))
    handler.mouseUp(editor.graph, event('mouseup', x, y))
  }

  it('turns the selected shapes to a whole angle from 0 to 359, and 0 removes the key', () => {
    const { doc, editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    editor.graph.setSelectionCells([a, b])

    editor.setRotation(45)
    expect([storedStyle(doc, a).rotation, storedStyle(doc, b).rotation]).toEqual([45, 45])
    expect(editor.getState().geometry).toMatchObject({ rotation: 45, canRotate: true, x: null, width: 120 })

    editor.setRotation(-90)
    expect(storedStyle(doc, a).rotation).toBe(270)
    editor.setRotation(400.4)
    expect(storedStyle(doc, a).rotation).toBe(40)
    editor.setRotation(Number.NaN)
    expect(storedStyle(doc, a).rotation).toBe(40)

    editor.setRotation(360)
    expect(storedStyle(doc, a)).not.toHaveProperty('rotation')
    expect(storedStyle(doc, b)).not.toHaveProperty('rotation')
    expect(editor.getState().geometry?.rotation).toBe(0)
    // The geometry stays that of the shape before it turned, as in draw.io.
    expect(a.getGeometry()).toMatchObject({ x: 100, y: 100, width: 120, height: 60 })
  })

  it('turns as one undo step that every participant sees', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)

    editor.setRotation(30)

    const theirs = other.editor.graph.getDataModel().getCell(cell.getId()!)!
    expect(theirs.getStyle().rotation).toBe(30)
    expect(other.editor.graph.getView().getState(theirs)?.style.rotation).toBe(30)
    editor.undo()
    expect(storedStyle(doc, cell)).not.toHaveProperty('rotation')
    expect(theirs.getStyle()).not.toHaveProperty('rotation')
    expect(cell.getGeometry()).toMatchObject({ x: 100, y: 100 })
  })

  it('shows the rotation shared by the selected shapes, and none when it differs', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    editor.graph.setSelectionCell(a)
    editor.setRotation(30)

    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().geometry).toMatchObject({ rotation: null, canRotate: true })

    editor.setRotation(90)
    expect([a.getStyle().rotation, b.getStyle().rotation]).toEqual([90, 90])
    expect(editor.getState().geometry?.rotation).toBe(90)
    editor.undo()
    expect([a.getStyle().rotation, b.getStyle()]).toEqual([30, expect.not.objectContaining({ rotation: expect.anything() })])
  })

  it('turns neither edges, tables, their fields nor groups', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    const table = editor.addShape('table', { x: 300, y: 400 })!
    const field = table.getChildAt(0)
    const first = shape(editor, 100, 600)
    const second = shape(editor, 300, 600)
    editor.graph.setSelectionCells([first, second])
    const group = editor.group()!

    editor.graph.setSelectionCells([edge, table, field, group])
    expect(editor.getState().geometry).toMatchObject({ rotation: null, canRotate: false })
    editor.setRotation(45)

    for (const cell of [edge, table, field, group, first, second]) expect(cell.getStyle()).not.toHaveProperty('rotation')
    expect(editor.graph.isCellRotatable(table)).toBe(false)
    expect(editor.graph.isCellRotatable(group)).toBe(false)
    // A shape of a group turns on its own, selected with a second click.
    editor.graph.setSelectionCell(first)
    editor.setRotation(45)
    expect(first.getStyle().rotation).toBe(45)
  })

  it('turns no locked shape, and the other selected shapes turn', () => {
    const { editor } = open()
    const locked = shape(editor, 100, 100)
    const free = shape(editor, 400, 100)
    editor.graph.setSelectionCell(locked)
    editor.setLocked(true)

    editor.graph.setSelectionCells([locked, free])
    editor.setRotation(45)

    expect(locked.getStyle()).not.toHaveProperty('rotation')
    expect(free.getStyle().rotation).toBe(45)
    expect(editor.graph.isCellRotatable(locked)).toBe(false)
  })

  it('lets a participant who may only view turn nothing', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 100, 100)
    const viewer = open({ doc, readOnly: true }).editor
    const before = Y.encodeStateVector(doc)
    const theirs = viewer.graph.getDataModel().getCell(cell.getId()!)!
    viewer.graph.setSelectionCell(theirs)

    viewer.setRotation(45)

    expect(Y.encodeStateVector(doc)).toEqual(before)
    expect(viewer.graph.isCellRotatable(theirs)).toBe(false)
    expect(handlerOf(viewer, theirs).rotationShape).toBeNull()
  })

  it('gives a selected shape a handle out of its top-left corner that turns with it', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)
    const state = editor.graph.getView().getState(cell)!
    const handle = () => handlerOf(editor, cell).rotationShape!.bounds!

    expect(handle().getCenterX()).toBe(state.x - 12)
    expect(handle().getCenterY()).toBe(state.y - 12)

    editor.setRotation(180)
    expect(handle().getCenterX()).toBe(state.x + state.width + 12)
    expect(handle().getCenterY()).toBe(state.y + state.height + 12)
  })

  it('gives no handle to locked shapes, tables and groups, and a shape unlocked gets one', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    const table = editor.addShape('table', { x: 300, y: 400 })!
    editor.graph.setSelectionCells([shape(editor, 100, 600), shape(editor, 300, 600)])
    const group = editor.group()!

    for (const selected of [table, group]) {
      editor.graph.setSelectionCell(selected)
      expect(handlerOf(editor, selected).rotationShape).toBeNull()
    }
    editor.graph.setSelectionCell(cell)
    expect(handlerOf(editor, cell).rotationShape).not.toBeNull()
    editor.setLocked(true)
    expect(handlerOf(editor, cell).rotationShape).toBeNull()
    editor.setLocked(false)
    expect(handlerOf(editor, cell).rotationShape).not.toBeNull()
  })

  it('turns a shape by its handle in steps of 15°, as one undo step', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)

    dragRotationHandle(editor, cell, 50)

    expect(storedStyle(doc, cell).rotation).toBe(45)
    expect(other.editor.graph.getDataModel().getCell(cell.getId()!)!.getStyle().rotation).toBe(45)
    expect(editor.getState().geometry?.rotation).toBe(45)

    // From where it is now, back past straight up: the angle stays within 0–359.
    dragRotationHandle(editor, cell, -20)
    expect(storedStyle(doc, cell).rotation).toBe(345)
    editor.undo()
    expect(storedStyle(doc, cell).rotation).toBe(45)
    editor.undo()
    expect(storedStyle(doc, cell)).not.toHaveProperty('rotation')
  })

  it('turns a shape by whole degrees with Alt, and back to straight without the key', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)

    dragRotationHandle(editor, cell, 50.4, true)
    expect(storedStyle(doc, cell).rotation).toBe(50)

    dragRotationHandle(editor, cell, 4)
    expect(storedStyle(doc, cell)).not.toHaveProperty('rotation')
  })

  it('bounds a turned shape by the box around it', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)
    const state = editor.graph.getView().getState(cell)!

    editor.setRotation(90)

    const bounds = editor.cellBounds(cell.getId()!)!
    expect(bounds.x).toBeCloseTo(state.x + 30)
    expect(bounds.y).toBeCloseTo(state.y - 30)
    expect(bounds.width).toBeCloseTo(60)
    expect(bounds.height).toBeCloseTo(120)
  })

  it('ends an edge at the turned border of a turned shape while the edge has no route', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 300)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    editor.graph.setSelectionCell(b)

    editor.setRotation(45)

    const view = editor.graph.getView()
    const end = view.getState(edge)!.absolutePoints.at(-1)!
    const target = view.getState(b)!
    // The end in coordinates of the shape before it turned lies on its border.
    const [dx, dy] = [end.x - target.getCenterX(), end.y - target.getCenterY()]
    const radians = (-45 * Math.PI) / 180
    const x = dx * Math.cos(radians) - dy * Math.sin(radians)
    const y = dx * Math.sin(radians) + dy * Math.cos(radians)
    expect(Math.max(Math.abs(x) / (target.width / 2), Math.abs(y) / (target.height / 2))).toBeCloseTo(1, 1)
  })
})
