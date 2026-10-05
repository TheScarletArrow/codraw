import { Geometry, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { parseDrawio } from '../drawio/parse.ts'
import { importPages } from '../drawio/importPages.ts'
import { createDiagramEditor, isGroup, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'

describe('arranging shapes', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc(), pageId?: string) {
    if (!pageId) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { pageId })
    editors.push(editor)
    return { doc, editor }
  }

  /** Adds a rectangle of 100 by 60 at the point. */
  function shape(editor: DiagramEditor, x: number, y: number, width = 100): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    const model = editor.graph.getDataModel()
    model.setGeometry(cell, new Geometry(x, y, width, 60))
    return cell
  }

  const geometryOf = (cell: Cell) => cell.getGeometry()!

  it('aligns the selected shapes on the left side of the area they cover, in one undo step', () => {
    const { editor } = open()
    const shapes = [shape(editor, 100, 0), shape(editor, 160, 100), shape(editor, 240, 200)]
    editor.graph.setSelectionCells(shapes)
    expect(editor.getState().arrange).toBe(3)

    editor.alignShapes('left')

    expect(shapes.map((cell) => geometryOf(cell).x)).toEqual([100, 100, 100])
    editor.undo()
    expect(shapes.map((cell) => geometryOf(cell).x)).toEqual([100, 160, 240])
  })

  it('aligns centres and bottoms', () => {
    const { editor } = open()
    const a = shape(editor, 0, 0, 100)
    const b = shape(editor, 300, 100, 200)
    editor.graph.setSelectionCells([a, b])

    editor.alignShapes('center')
    expect(geometryOf(a).x + 50).toBe(geometryOf(b).x + 100)

    editor.alignShapes('bottom')
    expect(geometryOf(a).y).toBe(100)
  })

  it('leaves the fields of tables and edges out of the arrangement', () => {
    const { editor } = open()
    const table = editor.addShape('table', { x: 500, y: 100 })!
    const a = shape(editor, 0, 0)
    editor.graph.setSelectionCells([a, table.getChildAt(0)])

    expect(editor.getState().arrange).toBe(1)
  })

  it('spaces shapes evenly between the outermost ones', () => {
    const { editor } = open()
    const shapes = [shape(editor, 0, 0), shape(editor, 500, 0), shape(editor, 150, 0)]
    editor.graph.setSelectionCells(shapes)

    editor.distributeShapes('horizontal')

    expect(shapes.map((cell) => geometryOf(cell).x)).toEqual([0, 500, 250])
    editor.undo()
    expect(geometryOf(shapes[2]!).x).toBe(150)
  })

  it('spaces shapes of different sizes with equal gaps', () => {
    const { editor } = open()
    const model = editor.graph.getDataModel()
    const shapes = [shape(editor, 0, 0), shape(editor, 0, 100), shape(editor, 0, 400)]
    model.setGeometry(shapes[1]!, new Geometry(0, 100, 100, 160))
    editor.graph.setSelectionCells(shapes)

    editor.distributeShapes('vertical')

    // From 0 to 460: 60 + 160 + 60 of shapes and two gaps of 90.
    expect(shapes.map((cell) => geometryOf(cell).y)).toEqual([0, 150, 400])
  })

  it('spaces a shape in a group together with shapes on the page, by their places on the page', () => {
    const { editor } = open()
    const a = shape(editor, 100, 0)
    const b = shape(editor, 400, 300)
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!
    const left = shape(editor, -500, 0)
    const right = shape(editor, 1000, 0)
    // The group starts at 100, and b is at 300 in it.
    expect([geometryOf(group).x, geometryOf(b).x]).toEqual([100, 300])
    editor.graph.setSelectionCells([left, b, right])

    editor.distributeShapes('horizontal')

    // From -500 to 1100: three shapes of 100 and two gaps of 650.
    expect(geometryOf(b).x + geometryOf(group).x).toBe(250)
    expect([geometryOf(left).x, geometryOf(right).x]).toEqual([-500, 1000])
  })

  it('groups the selected shapes with the edge between them as one undo step, and selects the group', () => {
    const { doc, editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().canGroup).toBe(true)

    const group = editor.group()!

    expect(isGroup(group)).toBe(true)
    expect(editor.graph.getSelectionCells()).toEqual([group])
    expect([a.getParent(), b.getParent(), edge.getParent()]).toEqual([group, group, group])
    expect(geometryOf(group)).toMatchObject({ x: 100, y: 100, width: 400, height: 60 })
    expect(geometryOf(a)).toMatchObject({ x: 0, y: 0 })
    const stored = readCell(a.getId()!, getCells(doc).get(a.getId()!)!)
    expect(stored.parent).toBe(group.getId())
    expect(editor.getState()).toMatchObject({ canUngroup: true, canGroup: false })

    editor.undo()
    // Undo goes through the document: the cell is read again from it.
    const restored = editor.graph.getDataModel().getCell(a.getId()!)!
    expect(restored.getParent()).toBe(editor.graph.getDefaultParent())
    expect(geometryOf(restored)).toMatchObject({ x: 100, y: 100 })
    expect(editor.graph.getDataModel().getCell(group.getId()!)).toBeFalsy()
  })

  it('moves a group with what it holds', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!

    editor.graph.moveCells([group], 50, 20)

    const view = editor.graph.getView()
    expect(view.getState(a)!.x).toBe((150 + view.translate.x) * view.scale)
    expect(view.getState(b)!.y).toBe((120 + view.translate.y) * view.scale)
  })

  it('ungroups the shapes in their places and selects them', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 200)
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!

    editor.ungroup()

    expect(group.getParent()).toBeNull()
    expect(editor.graph.getSelectionCells()).toEqual([a, b])
    expect([geometryOf(a), geometryOf(b)]).toMatchObject([
      { x: 100, y: 100 },
      { x: 400, y: 200 },
    ])
  })

  it('does not group a single shape or fields of a table', () => {
    const { editor } = open()
    const a = shape(editor, 0, 0)
    const table = editor.addShape('table', { x: 500, y: 100 })!
    editor.graph.setSelectionCells([a, table.getChildAt(0)])

    expect(editor.getState().canGroup).toBe(false)
    expect(editor.group()).toBeNull()
  })

  it('copies a group with its shapes and the edge between them', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!

    editor.copy()
    editor.paste()

    const groups = editor.graph.getDefaultParent().getChildren().filter(isGroup)
    expect(groups).toHaveLength(2)
    const copy = groups.find((cell) => cell !== group)!
    expect(copy.getChildren().filter((cell) => cell.isVertex())).toHaveLength(2)
    expect(copy.getChildren().filter((cell) => cell.isEdge())).toHaveLength(1)
  })

  it('takes a group of draw.io for a group', async () => {
    const doc = new Y.Doc()
    const [pageId] = importPages(
      doc,
      await parseDrawio(`<mxfile><diagram id="p" name="Группа"><mxGraphModel><root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1"><mxGeometry x="100" y="100" width="300" height="60" as="geometry"/></mxCell>
        <mxCell id="a" value="A" style="rounded=0;" vertex="1" parent="g"><mxGeometry width="100" height="60" as="geometry"/></mxCell>
        <mxCell id="b" value="B" style="rounded=0;" vertex="1" parent="g"><mxGeometry x="200" width="100" height="60" as="geometry"/></mxCell>
      </root></mxGraphModel></diagram></mxfile>`),
    )
    const { editor } = open(doc, pageId)
    const group = editor.graph.getDataModel().getCell('g')!

    expect(isGroup(group)).toBe(true)
    editor.graph.setSelectionCell(group)
    editor.ungroup()
    expect(editor.graph.getDataModel().getCell('a')!.getParent()).toBe(editor.graph.getDefaultParent())
  })

  it('fits the page into the canvas at most at 100%', () => {
    const { editor } = open()
    shape(editor, 0, 0)
    shape(editor, 4000, 3000)
    // jsdom lays nothing out: the canvas gets a size by hand.
    const container = editor.graph.container
    Object.defineProperties(container, { offsetWidth: { value: 800 }, offsetHeight: { value: 600 } })

    editor.zoomToFit()
    expect(editor.getState().scale).toBeLessThan(0.25)

    editor.graph.getDataModel().remove(editor.graph.getDefaultParent().getChildAt(1))
    editor.zoomToFit()
    expect(editor.getState().scale).toBe(1)
  })
})
