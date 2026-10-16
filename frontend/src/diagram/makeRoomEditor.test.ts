import { Geometry, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument } from './model.ts'
import type { ShapeId } from './shapes.ts'
import { connect } from './testing.ts'

describe('making room in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc()) {
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { participantName: 'Алиса' })
    editors.push(editor)
    return { editor, doc }
  }

  const boxOf = (cell: Cell) => {
    const { x, y, width, height } = cell.getGeometry()!
    return { x, y, width, height }
  }
  const right = (cell: Cell) => cell.getGeometry()!.x + cell.getGeometry()!.width
  const bottom = (cell: Cell) => cell.getGeometry()!.y + cell.getGeometry()!.height
  /** A frame grows by whole steps of the grid to leave at least 20 around what sticks out of it. */
  const grownTo = (edge: number, from: number) => from + Math.ceil((edge + 20 - from) / 10) * 10

  /** A shape of the palette added at `x`, `y` in one change, as a board would have it; a table keeps its own size. */
  function put(editor: DiagramEditor, kind: ShapeId, x: number, y: number, width?: number, height?: number): Cell {
    const model = editor.graph.getDataModel()
    model.beginUpdate()
    try {
      const cell = editor.addShape(kind)!
      const geometry = cell.getGeometry()!
      model.setGeometry(cell, new Geometry(x, y, width ?? geometry.width, height ?? geometry.height))
      return cell
    } finally {
      model.endUpdate()
    }
  }

  it('grows a boundary around a table dropped at its edge, and moves the service it covers then, in one undo step', () => {
    const { editor, doc } = open()
    const boundary = put(editor, 'boundary', 0, 0, 400, 300)
    const service = put(editor, 'service', 440, 40, 120, 60)
    put(editor, 'table', 20, 40)

    // A new table fits its width to its fields, keeping its left side: its centre is in the boundary, its right side out.
    const table = editor.addShape('table', { x: 440, y: 120 })!

    expect(table.getGeometry()!.x + table.getGeometry()!.width / 2).toBeLessThan(400)
    expect(right(boundary)).toBe(grownTo(right(table), 400))
    expect(service.getGeometry()!.x).toBe(right(boundary) + 40)
    expect(service.getGeometry()!.y).toBe(40)
    expect(getCells(doc).get(service.getId()!)!.get('geometry')).toMatchObject({ x: right(boundary) + 40, y: 40 })

    editor.undo()
    expect(editor.graph.getDataModel().getCell(table.getId()!)).toBeFalsy()
    expect(boxOf(boundary)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    expect(boxOf(service)).toEqual({ x: 440, y: 40, width: 120, height: 60 })
  })

  it('puts a table made by quick connect from a table of a boundary into it, on the axis, and the service makes room', () => {
    const { editor } = open()
    const source = put(editor, 'table', 200, 40)
    const boundary = put(editor, 'boundary', 0, 0, right(source) + 20, bottom(source) + 20)
    const width = boundary.getGeometry()!.width
    const service = put(editor, 'service', right(boundary) + 40, 40, 120, 60)
    const serviceBefore = boxOf(service)
    editor.graph.setSelectionCell(source)

    const added = editor.addConnectedShape('right', 'table')!

    // Where quick connect puts it: the service in the way out of the boundary does not shift it down.
    expect(added.getGeometry()!.y).toBe(source.getGeometry()!.y)
    expect(added.getGeometry()!.x).toBeGreaterThan(right(source))
    expect(right(boundary)).toBe(grownTo(right(added), width))
    expect(service.getGeometry()).toMatchObject({ x: right(boundary) + 40, y: 40 })

    editor.undo()
    expect(boxOf(service)).toEqual(serviceBefore)
    expect(boundary.getGeometry()!.width).toBe(width)
  })

  it('grows a boundary down with a table that gets a field, and moves the shape under it', () => {
    const { editor } = open()
    const table = put(editor, 'table', 20, 40)
    const boundary = put(editor, 'boundary', 0, 0, 300, bottom(table) + 20)
    const height = boundary.getGeometry()!.height
    const under = put(editor, 'service', 20, bottom(boundary) + 30, 120, 60)
    const tableBottom = bottom(table)
    editor.graph.setSelectionCell(table.getChildAt(0))

    editor.addTableField()
    editor.graph.stopEditing(true)

    expect(bottom(table)).toBeGreaterThan(tableBottom)
    expect(bottom(boundary)).toBe(grownTo(bottom(table), height))
    expect(under.getGeometry()!.y).toBe(bottom(boundary) + 30)
  })

  it('moves no original for a duplicate over it', () => {
    const { editor } = open()
    const original = put(editor, 'service', 100, 100, 120, 60)
    editor.graph.setSelectionCell(original)

    editor.duplicate()

    expect(boxOf(original)).toEqual({ x: 100, y: 100, width: 120, height: 60 })
  })

  it('moves no shape for a shape moved over it', () => {
    const { editor } = open()
    const moved = put(editor, 'service', 0, 0, 120, 60)
    const other = put(editor, 'service', 300, 0, 120, 60)
    editor.graph.setSelectionCell(moved)

    editor.moveSelection(250, 0)

    expect(boxOf(other)).toEqual({ x: 300, y: 0, width: 120, height: 60 })
  })

  it('makes room once, for the participant who drops: the other gets the same result and nothing to undo', () => {
    const alice = open()
    const bob = open(new Y.Doc())
    connect(alice.doc, bob.doc)
    const boundary = put(alice.editor, 'boundary', 0, 0, 400, 300)
    const service = put(alice.editor, 'service', 440, 40, 120, 60)

    alice.editor.addShape('table', { x: 440, y: 120 })

    const model = bob.editor.graph.getDataModel()
    expect(boxOf(model.getCell(boundary.getId()!)!)).toEqual(boxOf(boundary))
    expect(boxOf(model.getCell(service.getId()!)!)).toEqual(boxOf(service))
    expect(service.getGeometry()!.x).toBeGreaterThan(440)
    expect(bob.editor.getState().canUndo).toBe(false)
  })
})
