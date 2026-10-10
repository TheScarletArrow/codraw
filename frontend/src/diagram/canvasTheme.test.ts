import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  coversChildren,
  DARK_CANVAS_INK,
  DARK_CANVAS_SHADOW_OPACITY,
  darkCanvasStyle,
  isInk,
  SHADOW_OPACITY_KEY,
} from './canvasTheme.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument } from './model.ts'

describe('isInk', () => {
  it('takes black and the grays near it for ink', () => {
    for (const color of ['#1f2328', '#000000', '#000', 'black', '#333333', '#404040', '#1F2328']) {
      expect(isInk(color), color).toBe(true)
    }
  })

  it('leaves lighter grays, colors, dark colors with a hue and no color alone', () => {
    const others = ['#666666', '#414141', '#ffffff', '#b85450', '#08427B', '#073B6F', 'none', 'red', '', undefined, 0]
    for (const color of others) {
      expect(isInk(color), String(color)).toBe(false)
    }
  })
})

describe('darkCanvasStyle', () => {
  const ink = { strokeColor: '#1f2328', fontColor: '#1f2328' }

  it('draws an edge and its text in light ink', () => {
    const style = darkCanvasStyle({ ...ink }, true, true)
    expect(style).toMatchObject({ strokeColor: DARK_CANVAS_INK, fontColor: DARK_CANVAS_INK })
  })

  it('leaves the text of an edge on a label background as it is', () => {
    const style = darkCanvasStyle({ ...ink, labelBackgroundColor: '#ffffff' }, true, true)
    expect(style).toMatchObject({ strokeColor: DARK_CANVAS_INK, fontColor: '#1f2328' })
  })

  it('leaves the line and the text of a filled shape as they are', () => {
    const style = { ...ink, fillColor: '#ffffff' }
    expect(darkCanvasStyle(style, false, true)).toBe(style)
  })

  it('draws the line and the text of a shape without fill in light ink', () => {
    expect(darkCanvasStyle({ ...ink, fillColor: 'none' }, false, true)).toMatchObject({
      strokeColor: DARK_CANVAS_INK,
      fontColor: DARK_CANVAS_INK,
    })
  })

  it('counts a fill more transparent than half as no fill', () => {
    expect(darkCanvasStyle({ ...ink, fillColor: '#ffffff', fillOpacity: 30 }, false, true).fontColor).toBe(DARK_CANVAS_INK)
    expect(darkCanvasStyle({ ...ink, fillColor: '#ffffff', fillOpacity: 50 }, false, true).fontColor).toBe('#1f2328')
  })

  it('draws a caption outside a filled shape in light ink, but not its line', () => {
    const style = darkCanvasStyle({ ...ink, fillColor: '#ffffff', verticalLabelPosition: 'bottom' }, false, true)
    expect(style).toMatchObject({ strokeColor: '#1f2328', fontColor: DARK_CANVAS_INK })
  })

  it('leaves colors that are not ink as they are', () => {
    const style = { strokeColor: '#b85450', fontColor: '#6c8ebf', fillColor: 'none' }
    expect(darkCanvasStyle(style, false, true)).toBe(style)
  })

  it('leaves a cell over the fill of a shape that holds it as it is', () => {
    const style = { ...ink, fillColor: 'none' }
    expect(darkCanvasStyle(style, false, false)).toBe(style)
  })

  it('draws a shadow denser, also over a fill, and nothing else of a shape with a shadow', () => {
    const style = { fillColor: '#dae8fc', strokeColor: '#6c8ebf', shadow: true }
    expect(darkCanvasStyle(style, false, true)).toEqual({ ...style, [SHADOW_OPACITY_KEY]: DARK_CANVAS_SHADOW_OPACITY })
    expect(darkCanvasStyle(style, false, false)).toEqual({ ...style, [SHADOW_OPACITY_KEY]: DARK_CANVAS_SHADOW_OPACITY })
    expect(darkCanvasStyle({ ...style, shadow: false }, false, true)).not.toHaveProperty(SHADOW_OPACITY_KEY)
  })

  it('never changes the style it gets', () => {
    const style = { ...ink, fillColor: 'none' }
    darkCanvasStyle(style, false, true)
    expect(style).toEqual({ ...ink, fillColor: 'none' })
  })
})

describe('coversChildren', () => {
  it('takes the body of a swimlane for the area of its children', () => {
    expect(coversChildren({ shape: 'swimlane', fillColor: '#eef2f6', swimlaneFillColor: '#ffffff' })).toBe(true)
    expect(coversChildren({ shape: 'swimlane', fillColor: '#eef2f6' })).toBe(false)
  })

  it('takes the fill of other shapes', () => {
    expect(coversChildren({ fillColor: '#ffffff' })).toBe(true)
    expect(coversChildren({ fillColor: 'none' })).toBe(false)
  })
})

describe('dark canvas of the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc(), options: Parameters<typeof createDiagramEditor>[2] = {}) {
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, options)
    editors.push(editor)
    return { doc, editor, container }
  }

  /** Two rectangles, an edge between them with a label, a text, a caption under «Пользователь» and a table. */
  function diagram(editor: DiagramEditor) {
    const { graph } = editor
    const rectangle = editor.addShape('rectangle', { x: 100, y: 100 })!
    const service = editor.addShape('service', { x: 400, y: 100 })!
    const edge = graph.insertEdge({ parent: graph.getDefaultParent(), value: 'HTTP', source: rectangle, target: service })
    const text = editor.addShape('text', { x: 100, y: 300 })!
    const user = editor.addShape('user', { x: 400, y: 300 })!
    const table = editor.addShape('table', { x: 700, y: 100 })!
    return { rectangle, service, edge, text, user, table, field: table.getChildAt(0) }
  }

  const drawn = (editor: DiagramEditor, cell: Cell) => editor.graph.getView().getState(cell)!.style

  it('draws black lines and text on the canvas in light ink and leaves what lies on fills', () => {
    const { editor } = open(undefined, { theme: 'dark' })
    const { rectangle, edge, text, user, table, field } = diagram(editor)

    expect(drawn(editor, edge)).toMatchObject({ strokeColor: DARK_CANVAS_INK, fontColor: DARK_CANVAS_INK })
    expect(drawn(editor, text).fontColor).toBe(DARK_CANVAS_INK)
    expect(drawn(editor, user)).toMatchObject({ strokeColor: '#1f2328', fontColor: DARK_CANVAS_INK })
    expect(drawn(editor, rectangle)).toMatchObject({ strokeColor: '#1f2328', fontColor: '#1f2328', fillColor: '#ffffff' })
    expect(drawn(editor, table)).toMatchObject({ strokeColor: '#1f2328', fontColor: '#1f2328' })
    expect(drawn(editor, field).fontColor).toBe('#1f2328')
    // The line of the edge is drawn in light ink, besides the wider path that catches the pointer.
    const strokes = [...editor.graph.getView().getState(edge)!.shape!.node.querySelectorAll('path')].map((path) =>
      path.getAttribute('stroke'),
    )
    expect(strokes).toContain(DARK_CANVAS_INK)
    expect(strokes).not.toContain('#1f2328')
  })

  it('leaves chosen colors as they are', () => {
    const { editor } = open(undefined, { theme: 'dark' })
    const { edge, text } = diagram(editor)
    editor.graph.setSelectionCells([edge, text])

    editor.setColor('stroke', '#b85450')
    editor.setColor('font', '#6c8ebf')

    expect(drawn(editor, edge)).toMatchObject({ strokeColor: '#b85450', fontColor: '#6c8ebf' })
    expect(drawn(editor, text).fontColor).toBe('#6c8ebf')
  })

  it('changes neither the document nor the history nor the colors the toolbar shows', () => {
    const { doc, editor } = open()
    const { edge } = diagram(editor)
    editor.graph.setSelectionCell(edge)
    const before = Y.encodeStateAsUpdate(doc)
    const canUndo = editor.getState().canUndo
    let updates = 0
    doc.on('update', () => updates++)

    editor.setTheme('dark')

    expect(drawn(editor, edge).strokeColor).toBe(DARK_CANVAS_INK)
    expect(updates).toBe(0)
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
    expect(getCells(doc).get(edge.getId()!)!.toJSON().style).not.toHaveProperty('strokeColor')
    expect(edge.getStyle()).not.toHaveProperty('strokeColor')
    expect(editor.getState().colors).toMatchObject({ stroke: '#1f2328', font: '#1f2328' })
    expect(editor.getState().canUndo).toBe(canUndo)
  })

  it('draws the page light again when the theme turns light', () => {
    const { editor } = open(undefined, { theme: 'dark' })
    const { edge, text } = diagram(editor)

    editor.setTheme('light')

    expect(drawn(editor, edge)).toMatchObject({ strokeColor: '#1f2328', fontColor: '#1f2328' })
    expect(drawn(editor, text).fontColor).toBe('#1f2328')
  })

  it('draws images in the colors of the diagram and keeps the canvas dark', () => {
    const { editor } = open(undefined, { theme: 'dark' })
    const { edge } = diagram(editor)

    const image = editor.exportSvg()!

    expect(image.svg).not.toContain(DARK_CANVAS_INK)
    expect(image.svg).toContain('#1f2328')
    expect(drawn(editor, edge).strokeColor).toBe(DARK_CANVAS_INK)
  })

  it('draws the shadows of shapes denser on the dark canvas only, and keeps gradients and corners', () => {
    const { editor } = open(undefined, { theme: 'dark' })
    const { rectangle } = diagram(editor)
    editor.graph.setSelectionCell(rectangle)
    editor.setShapeEffects({ shadow: true, rounded: true, gradient: '#dae8fc' })

    expect(drawn(editor, rectangle)).toMatchObject({
      shadow: true,
      rounded: true,
      gradientColor: '#dae8fc',
      [SHADOW_OPACITY_KEY]: DARK_CANVAS_SHADOW_OPACITY,
    })
    const opacities = [...editor.graph.getView().getState(rectangle)!.shape!.node.querySelectorAll('[opacity]')].map(
      (node) => node.getAttribute('opacity'),
    )
    expect(opacities).toContain(String(DARK_CANVAS_SHADOW_OPACITY))
    // Images draw the shadow as the light canvas does.
    expect(editor.exportSvg()!.svg).toMatch(/fill="#000000"[^>]*transform="translate\(2,3\)" opacity="0.25"/)

    editor.setTheme('light')
    expect(drawn(editor, rectangle)).not.toHaveProperty(SHADOW_OPACITY_KEY)
    expect(rectangle.getStyle()).not.toHaveProperty(SHADOW_OPACITY_KEY)
  })

  it('follows the theme also for a participant who only views', () => {
    const doc = new Y.Doc()
    const { editor: owner } = open(doc)
    const { edge } = diagram(owner)
    const { editor: viewer } = open(doc, { readOnly: true })

    viewer.setTheme('dark')

    expect(drawn(viewer, viewer.graph.getDataModel().getCell(edge.getId()!)!).strokeColor).toBe(DARK_CANVAS_INK)
    expect(drawn(owner, edge).strokeColor).toBe('#1f2328')
  })
})
