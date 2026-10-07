import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { clampToBox, fitMap, fromMap, MAP_HEIGHT, MAP_WIDTH, paintColor, toMap } from './minimap.ts'
import { initializeDocument } from './model.ts'
import type { RoutingRequest, RoutingResponse } from './routing/edgeRouter.ts'
import { TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from './shapes.ts'

describe('the sketch of a page', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(build?: (builder: DiagramBuilder) => void) {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc)
    editors.push(editor)
    if (build) {
      const builder = new DiagramBuilder()
      build(builder)
      editor.insertCells(builder.build())
    }
    return editor
  }

  const cellOf = (editor: DiagramEditor, value: string) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => cell.getValue() === value)!

  it('draws a box for every shape where the canvas draws it, in its colors', () => {
    const editor = open((builder) => {
      const style = { fillColor: '#dbeafe', strokeColor: '#1d4ed8' }
      builder.shape('rectangle', 100, 50, { value: 'a', width: 120, height: 60, style })
      builder.shape('ellipse', 400, 300, { value: 'b', width: 80, height: 80 })
    })

    const sketch = editor.pageSketch()

    expect(sketch.shapes).toEqual([
      expect.objectContaining({
        id: cellOf(editor, 'a').getId(),
        ...{ x: 100, y: 50, width: 120, height: 60, fill: '#dbeafe', stroke: '#1d4ed8', ellipse: false, header: null },
      }),
      expect.objectContaining({
        id: cellOf(editor, 'b').getId(),
        ...{ x: 400, y: 300, width: 80, height: 80, fill: '#ffffff', ellipse: true },
      }),
    ])
    expect(sketch.bounds).toEqual({ x: 100, y: 50, width: 380, height: 330 })
  })

  it('keeps the turn of a shape and bounds it by the box around it', () => {
    const editor = open((builder) => {
      builder.shape('rectangle', 0, 0, { value: 'turned', width: 100, height: 20, style: { rotation: 90 } })
    })

    const [shape] = editor.pageSketch().shapes

    expect(shape).toMatchObject({ x: 0, y: 0, width: 100, height: 20, rotation: 90 })
    const bounds = editor.pageSketch().bounds!
    expect(bounds.x).toBeCloseTo(40)
    expect(bounds.y).toBeCloseTo(-40)
    expect(bounds.width).toBeCloseTo(20)
    expect(bounds.height).toBeCloseTo(100)
  })

  it('draws a table whole, with its header and without its fields', () => {
    const editor = open((builder) => {
      builder.table('users', 10, 20, ['id uuid PK', 'email text'], 200)
    })

    const { shapes } = editor.pageSketch()

    expect(shapes).toEqual([
      expect.objectContaining({
        id: cellOf(editor, 'users').getId(),
        x: 10,
        y: 20,
        width: 200,
        height: TABLE_HEADER_HEIGHT + 2 * TABLE_FIELD_HEIGHT,
        fill: '#ffffff',
        header: { height: TABLE_HEADER_HEIGHT, fill: '#eef2f6' },
      }),
    ])
  })

  it('draws a group by its shapes and a text as a shape without colors', () => {
    const editor = open((builder) => {
      builder.shape('rectangle', 0, 0, { value: 'a' })
      builder.shape('rectangle', 200, 0, { value: 'b' })
      builder.shape('text', 0, 200, { value: 'note' })
    })
    editor.graph.setSelectionCells([cellOf(editor, 'a'), cellOf(editor, 'b')])
    const group = editor.group()!

    const { shapes } = editor.pageSketch()

    expect(shapes.map((shape) => shape.id)).not.toContain(group.getId())
    expect(shapes.map((shape) => shape.id)).toEqual(
      expect.arrayContaining([cellOf(editor, 'note').getId(), ...group.getChildren().map((cell) => cell.getId())]),
    )
    const note = shapes.find((shape) => shape.id === cellOf(editor, 'note').getId())
    expect(note).toMatchObject({ fill: null, stroke: null })
  })

  it('draws an edge along the points of its line, in its color', () => {
    const editor = open((builder) => {
      const a = builder.shape('rectangle', 0, 0, { value: 'a', width: 100, height: 60 })
      const b = builder.shape('rectangle', 300, 0, { value: 'b', width: 100, height: 60 })
      builder.edge(a, b, { value: 'ab', style: { strokeColor: '#dc2626', edgeStyle: 'none' } })
    })

    const { edges, bounds } = editor.pageSketch()

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ id: cellOf(editor, 'ab').getId(), stroke: '#dc2626' })
    const [start, end] = edges[0]!.points
    expect(start!.x).toBeCloseTo(100)
    expect(start!.y).toBeCloseTo(30)
    expect(end!.x).toBeCloseTo(300)
    expect(end!.y).toBeCloseTo(30)
    expect(bounds).toEqual({ x: 0, y: 0, width: 400, height: 60 })
  })

  it('paints only with colors', () => {
    const editor = open((builder) => {
      const style = { fillColor: 'url(https://example.com/x.svg#paint)', strokeColor: 'none' }
      builder.shape('rectangle', 0, 0, { value: 'a', style })
    })

    expect(editor.pageSketch().shapes[0]).toMatchObject({ fill: null, stroke: null })
    expect(paintColor('#1f2328')).toBe('#1f2328')
    expect(paintColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
    expect(paintColor('red')).toBe('red')
    expect(paintColor('none')).toBeNull()
    expect(paintColor('url(#a)')).toBeNull()
    expect(paintColor(42)).toBeNull()
  })

  it('has nothing on an empty page', () => {
    expect(open().pageSketch()).toEqual({ shapes: [], edges: [], bounds: null })
  })

  it('gives the same sketch until the page changes', () => {
    const editor = open((builder) => {
      builder.shape('rectangle', 0, 0, { value: 'a' })
    })
    const sketch = editor.pageSketch()

    editor.zoomTo(2)
    editor.centerOn({ x: 500, y: 500 })
    expect(editor.pageSketch()).toBe(sketch)

    editor.graph.setSelectionCell(cellOf(editor, 'a'))
    editor.moveSelection(10, 0)
    const moved = editor.pageSketch()
    expect(moved).not.toBe(sketch)
    expect(moved.shapes[0]!.x).toBeCloseTo(10)
  })

  it('follows new routes of edges, which the view tells about', async () => {
    const requests: RoutingRequest[] = []
    const workers: { onmessage: ((event: { data: RoutingResponse }) => void) | null }[] = []
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((event: { data: RoutingResponse }) => void) | null = null
        constructor() {
          workers.push(this)
        }
        postMessage(request: RoutingRequest) {
          requests.push(request)
        }
        terminate() {}
      },
    )
    try {
      const editor = open((builder) => {
        const a = builder.shape('rectangle', 0, 0, { value: 'a', width: 100, height: 60 })
        const b = builder.shape('rectangle', 300, 200, { value: 'b', width: 100, height: 60 })
        builder.edge(a, b, { value: 'ab' })
      })
      await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0))
      const before = editor.pageSketch()
      const viewChanged = vi.fn()
      editor.onViewChange(viewChanged)
      const route = [
        { x: 100, y: 30 },
        { x: 200, y: 30 },
        { x: 200, y: 230 },
        { x: 300, y: 230 },
      ]

      workers[0]!.onmessage!({ data: { id: requests.at(-1)!.id, routes: { [cellOf(editor, 'ab').getId()!]: route } } })

      expect(viewChanged).toHaveBeenCalled()
      const after = editor.pageSketch()
      expect(after).not.toBe(before)
      expect(after.edges[0]!.points.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))).toEqual(route)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('tells the visible area of the canvas in coordinates of the diagram', () => {
    const editor = open()
    const container = editor.graph.container
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })

    editor.zoomTo(2)

    const { scale, translate } = editor.graph.getView()
    expect(editor.visibleArea()).toEqual({
      x: container.scrollLeft / scale - translate.x,
      y: container.scrollTop / scale - translate.y,
      width: 400,
      height: 300,
    })
  })
})

describe('the map', () => {
  it('fits the drawing and the visible area in the middle of the minimap', () => {
    const transform = fitMap({ x: 0, y: 0, width: 1000, height: 400 }, { x: 800, y: 300, width: 400, height: 300 })

    expect(transform.extent).toEqual({ x: 0, y: 0, width: 1200, height: 600 })
    // The width limits the scale; the picture is centred vertically.
    expect(transform.scale).toBeCloseTo(180 / 1200)
    expect(transform.offset.x).toBeCloseTo(6)
    expect(transform.offset.y).toBeCloseTo((MAP_HEIGHT - 600 * transform.scale) / 2)
  })

  it('shows the visible area alone on an empty page', () => {
    const transform = fitMap(null, { x: -100, y: -50, width: 300, height: 200 })

    expect(transform.extent).toEqual({ x: -100, y: -50, width: 300, height: 200 })
    expect(toMap(transform, { x: 50, y: 50 })).toEqual({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 })
  })

  it('takes points to the minimap and back', () => {
    const transform = fitMap({ x: -200, y: 100, width: 2000, height: 900 }, { x: 0, y: 0, width: 500, height: 400 })
    const point = { x: 640, y: 333 }

    const back = fromMap(transform, toMap(transform, point))

    expect(back.x).toBeCloseTo(point.x)
    expect(back.y).toBeCloseTo(point.y)
  })

  it('does not divide by nothing', () => {
    const transform = fitMap(null, { x: 10, y: 10, width: 0, height: 0 })

    expect(Number.isFinite(transform.scale)).toBe(true)
  })

  it('moves a point outside a box onto its nearest edge', () => {
    const box = { x: 0, y: 0, width: 100, height: 50 }

    expect(clampToBox({ x: 150, y: -20 }, box)).toEqual({ x: 100, y: 0 })
    expect(clampToBox({ x: 30, y: 20 }, box)).toEqual({ x: 30, y: 20 })
  })
})
