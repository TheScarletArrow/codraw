import { Geometry } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'

describe('the view of the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc)
    editors.push(editor)
    return editor
  }

  it('zooms to a scale within the limits, keeping the middle of the view', () => {
    const editor = open()
    editor.centerOn({ x: 500, y: 400 })
    const middle = editor.viewportCenter()

    editor.zoomTo(1.5)

    expect(editor.getState().scale).toBe(1.5)
    expect(editor.viewportCenter().x).toBeCloseTo(middle.x, 0)
    expect(editor.viewportCenter().y).toBeCloseTo(middle.y, 0)

    editor.zoomTo(100)
    expect(editor.getState().scale).toBe(8)
    editor.zoomTo(0)
    expect(editor.getState().scale).toBe(0.1)
  })

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
  const turnWheel = (editor: DiagramEditor, deltaY: number) =>
    editor.graph.container.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, bubbles: true, cancelable: true }))

  it('zooms once a frame by all the turns of the wheel with Ctrl in it', async () => {
    const editor = open()
    const zoom = vi.spyOn(editor.graph, 'zoom')

    turnWheel(editor, -100)
    turnWheel(editor, -100)
    turnWheel(editor, 100)
    turnWheel(editor, -100)
    expect(zoom).not.toHaveBeenCalled()
    await nextFrame()

    expect(zoom).toHaveBeenCalledOnce()
    expect(editor.getState().scale).toBeCloseTo(1.2 ** 2, 2)

    // Turns that undo each other zoom nothing.
    turnWheel(editor, -100)
    turnWheel(editor, 100)
    await nextFrame()
    expect(zoom).toHaveBeenCalledOnce()
  })

  it('reports that the view moved once a frame, however many times it moved in it', async () => {
    const editor = open()
    const moved = vi.fn()
    editor.onViewChange(moved)
    const version = editor.getViewVersion()

    editor.zoomTo(2)
    editor.centerOn({ x: 300, y: 200 })
    editor.addShape('rectangle', { x: 0, y: 0 })

    // The version tells at once that the view is another.
    expect(editor.getViewVersion()).toBeGreaterThan(version)
    expect(moved).not.toHaveBeenCalled()
    await nextFrame()
    expect(moved).toHaveBeenCalledOnce()
  })

  it('reports the middle of the view in the coordinates of the diagram', () => {
    const editor = open()

    editor.centerOn({ x: 1200, y: 900 })

    expect(editor.viewportCenter().x).toBeCloseTo(1200, 0)
    expect(editor.viewportCenter().y).toBeCloseTo(900, 0)
  })

  it('gives the points of the line of an edge as drawn, relative to the visible corner of the canvas', () => {
    const editor = open()
    const model = editor.graph.getDataModel()
    const source = editor.addShape('rectangle', { x: 0, y: 0 })!
    const target = editor.addShape('rectangle', { x: 0, y: 0 })!
    model.setGeometry(source, new Geometry(100, 100, 100, 60))
    model.setGeometry(target, new Geometry(400, 100, 100, 60))
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), source, target, style: { edgeStyle: 'none' } })

    const points = editor.edgePoints(edge.getId()!)!
    const { translate, scale } = editor.graph.getView()

    expect(points).toHaveLength(2)
    expect(points[0]!.x).toBeCloseTo((200 + translate.x) * scale)
    expect(points[0]!.y).toBeCloseTo((130 + translate.y) * scale)
    expect(points[1]!.x).toBeCloseTo((400 + translate.x) * scale)
    expect(editor.edgePoints(source.getId()!)).toBeNull()
    expect(editor.edgePoints('missing')).toBeNull()
  })
})
