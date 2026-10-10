import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'

describe('line and text styles', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  /** An editor on a fresh board with two shapes and an edge between them. */
  function open() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {})
    editors.push(editor)
    const a = editor.addShape('rectangle', { x: 100, y: 100 })!
    const b = editor.addShape('rectangle', { x: 400, y: 300 })!
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    return { doc, editor, a, b, edge }
  }

  const styleOf = (doc: Y.Doc, id: string) => readCell(id, getCells(doc).get(id)!).style
  const undoSteps = (editor: DiagramEditor) => {
    let steps = 0
    while (editor.getState().canUndo) {
      editor.undo()
      steps++
    }
    return steps
  }

  it('sets the width and the dash of the selected shapes and edges in one undo step', () => {
    const { doc, editor, a, edge } = open()
    editor.graph.setSelectionCells([a, edge])

    editor.setLineStyle({ width: 4, dash: 'dotted' })

    expect(styleOf(doc, a.getId()!)).toMatchObject({ strokeWidth: 4, dashed: true, dashPattern: '1 2' })
    expect(styleOf(doc, edge.getId()!)).toMatchObject({ strokeWidth: 4, dashed: true, dashPattern: '1 2' })
    expect(editor.getState().line).toEqual({
      width: 4,
      dash: 'dotted',
      edgeShape: 'orthogonal',
      hasEdges: true,
      shapes: { shadow: false, rounded: false, arcSize: null, canRound: true },
    })
  })

  it('removes the keys of the default width and dash', () => {
    const { doc, editor, a } = open()
    editor.graph.setSelectionCell(a)
    editor.setLineStyle({ width: 3, dash: 'dashed' })

    editor.setLineStyle({ width: 1, dash: 'solid' })

    const style = styleOf(doc, a.getId()!)
    expect(style).not.toHaveProperty('strokeWidth')
    expect(style).not.toHaveProperty('dashed')
    expect(style).not.toHaveProperty('dashPattern')
    expect(editor.getState().line).toMatchObject({ width: 1, dash: 'solid', hasEdges: false, edgeShape: null })
  })

  it('keeps the width within its limits', () => {
    const { doc, editor, a } = open()
    editor.graph.setSelectionCell(a)

    editor.setLineStyle({ width: 99 })

    expect(styleOf(doc, a.getId()!).strokeWidth).toBe(20)
  })

  it('shapes only the selected edges', () => {
    const { doc, editor, a, edge } = open()
    editor.graph.setSelectionCells([a, edge])

    editor.setLineStyle({ edgeShape: 'straight' })
    expect(styleOf(doc, edge.getId()!)).toMatchObject({ edgeStyle: 'none' })
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('edgeStyle')

    editor.setLineStyle({ edgeShape: 'curved' })
    expect(styleOf(doc, edge.getId()!)).toMatchObject({ curved: true })
    expect(styleOf(doc, edge.getId()!)).not.toHaveProperty('edgeStyle')
    expect(editor.getState().line?.edgeShape).toBe('curved')

    editor.setLineStyle({ edgeShape: 'orthogonal' })
    expect(styleOf(doc, edge.getId()!)).not.toHaveProperty('curved')
    expect(editor.getState().line?.edgeShape).toBe('orthogonal')
  })

  it('shows no value where the selected objects differ', () => {
    const { editor, a, b } = open()
    editor.graph.setSelectionCell(a)
    editor.setLineStyle({ width: 3, dash: 'dashed' })

    editor.graph.setSelectionCells([a, b])

    expect(editor.getState().line).toMatchObject({ width: null, dash: null })
  })

  it('turns a font style on for all the selected objects, and off when all have it', () => {
    const { doc, editor, a, b } = open()
    editor.graph.setSelectionCell(a)
    editor.toggleFontStyle('bold')
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().text).toMatchObject({ bold: false, italic: false })

    editor.toggleFontStyle('bold')
    expect(styleOf(doc, b.getId()!).fontStyle).toBe(1)
    expect(editor.getState().text?.bold).toBe(true)

    editor.toggleFontStyle('italic')
    expect(styleOf(doc, a.getId()!).fontStyle).toBe(3)

    editor.toggleFontStyle('bold')
    editor.toggleFontStyle('italic')
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('fontStyle')
  })

  it('changes the font style and the alignment of the name and the fields of a selected table', () => {
    const { doc, editor } = open()
    const table = editor.addShape('table', { x: 700, y: 100 })!
    const field = table.getChildAt(0)
    editor.graph.setSelectionCell(table)
    expect(editor.getState().text?.align).toBeNull()

    editor.toggleFontStyle('underline')
    editor.setTextAlign('right')

    expect(styleOf(doc, field.getId()!)).toMatchObject({ fontStyle: 4, align: 'right' })
    expect(editor.getState().text).toMatchObject({ underline: true, align: 'right' })

    editor.setTextAlign('center')
    expect(styleOf(doc, field.getId()!)).not.toHaveProperty('align')
    expect(editor.getState().text?.align).toBe('center')
  })

  it('makes each command one step of undo', () => {
    const { editor, a } = open()
    // The shapes and the edge are three steps.
    editor.graph.setSelectionCell(a)

    editor.setLineStyle({ width: 2, dash: 'dashed' })
    editor.toggleFontStyle('bold')
    editor.setTextAlign('left')

    expect(undoSteps(editor)).toBe(3 + 3)
  })

  it('sets the font of the selected shapes and edges, with Arial as the default, as one undo step', () => {
    const { doc, editor, a, b, edge } = open()
    editor.graph.setSelectionCells([a, edge])
    expect(editor.getState().text?.fontFamily).toBe('Arial')

    editor.setFontFamily('Georgia')

    expect(styleOf(doc, a.getId()!).fontFamily).toBe('Georgia')
    expect(styleOf(doc, edge.getId()!).fontFamily).toBe('Georgia')
    expect(editor.getState().text?.fontFamily).toBe('Georgia')
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().text?.fontFamily).toBeNull()

    editor.setFontFamily('Arial')
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('fontFamily')
    expect(undoSteps(editor)).toBe(3 + 2)
  })

  it('sets the font of the name and the fields of a selected table, and a new field takes the font of its neighbour', () => {
    const { doc, editor } = open()
    const table = editor.addShape('table', { x: 700, y: 100 })!
    editor.graph.setSelectionCell(table)

    editor.setFontFamily('Courier New')

    expect(styleOf(doc, table.getId()!).fontFamily).toBe('Courier New')
    expect(styleOf(doc, table.getChildAt(0).getId()!).fontFamily).toBe('Courier New')
    const field = editor.addTableField()!
    expect(styleOf(doc, field.getId()!).fontFamily).toBe('Courier New')
  })

  it('sets the opacity of the fill of the selected shapes only, with opaque as the default, as one undo step', () => {
    const { doc, editor, a, b, edge } = open()
    editor.graph.setSelectionCells([a, edge])
    expect(editor.getState().colors?.fillOpacity).toBe(100)

    editor.setFillOpacity(40)

    expect(styleOf(doc, a.getId()!).fillOpacity).toBe(40)
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('opacity')
    expect(styleOf(doc, edge.getId()!)).not.toHaveProperty('fillOpacity')
    expect(editor.getState().colors?.fillOpacity).toBe(40)
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().colors?.fillOpacity).toBeNull()

    editor.setFillOpacity(140)
    expect(styleOf(doc, b.getId()!)).not.toHaveProperty('fillOpacity')
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('fillOpacity')
    expect(undoSteps(editor)).toBe(3 + 2)
  })

  it('turns the shadow of the selected shapes on and off, not of edges, as one undo step each', () => {
    const { doc, editor, a, b, edge } = open()
    editor.graph.setSelectionCells([a, b, edge])

    editor.setShapeEffects({ shadow: true })

    expect(styleOf(doc, a.getId()!).shadow).toBe(true)
    expect(styleOf(doc, b.getId()!).shadow).toBe(true)
    expect(styleOf(doc, edge.getId()!)).not.toHaveProperty('shadow')
    expect(editor.getState().line?.shapes?.shadow).toBe(true)
    editor.graph.setSelectionCell(b)
    editor.setShapeEffects({ shadow: false })
    expect(styleOf(doc, b.getId()!)).not.toHaveProperty('shadow')
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().line?.shapes?.shadow).toBe(false)
    expect(undoSteps(editor)).toBe(3 + 2)
  })

  it('rounds the corners of the shapes that can round them, with a radius in percent', () => {
    const { doc, editor, a } = open()
    const ellipse = editor.addShape('ellipse', { x: 600, y: 100 })!
    editor.graph.setSelectionCells([a, ellipse])
    expect(editor.getState().line?.shapes).toEqual({ shadow: false, rounded: false, arcSize: null, canRound: true })

    editor.setShapeEffects({ rounded: true })
    expect(styleOf(doc, a.getId()!).rounded).toBe(true)
    expect(styleOf(doc, ellipse.getId()!)).not.toHaveProperty('rounded')
    expect(editor.getState().line?.shapes).toMatchObject({ rounded: true, arcSize: 15 })

    editor.setShapeEffects({ arcSize: 30 })
    expect(styleOf(doc, a.getId()!).arcSize).toBe(30)
    editor.setShapeEffects({ arcSize: 90 })
    expect(styleOf(doc, a.getId()!).arcSize).toBe(50)
    editor.setShapeEffects({ arcSize: 15 })
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('arcSize')

    editor.setShapeEffects({ arcSize: 25 })
    editor.setShapeEffects({ rounded: false })
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('rounded')
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('arcSize')

    editor.graph.setSelectionCell(ellipse)
    expect(editor.getState().line?.shapes?.canRound).toBe(false)
    expect(undoSteps(editor)).toBe(4 + 6)
  })

  it('shows the radius of rounded shapes from the palette and from draw.io', () => {
    const { doc, editor, a, b } = open()
    const rounded = editor.addShape('rounded', { x: 600, y: 100 })!
    editor.graph.setSelectionCell(rounded)
    expect(editor.getState().line?.shapes).toMatchObject({ rounded: true, arcSize: 15 })

    editor.graph.setSelectionCells([a, b])
    editor.setShapeEffects({ rounded: true })
    editor.graph.setSelectionCell(b)
    editor.setShapeEffects({ arcSize: 40 })
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().line?.shapes).toMatchObject({ rounded: true, arcSize: null })

    // A radius in pixels, as draw.io keeps it with absoluteArcSize, is no share of the side.
    editor.graph.getDataModel().setStyle(a, { ...a.getStyle(), absoluteArcSize: true, arcSize: 24 })
    editor.graph.setSelectionCell(a)
    expect(editor.getState().line?.shapes?.arcSize).toBeNull()
    editor.setShapeEffects({ arcSize: 20 })
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('absoluteArcSize')
    expect(styleOf(doc, a.getId()!).arcSize).toBe(20)
  })

  it('sets the gradient of the fill of the selected shapes, its color and direction, one undo step each', () => {
    const { doc, editor, a, b, edge } = open()
    editor.graph.setSelectionCells([a, edge])
    expect(editor.getState().colors).toMatchObject({ gradient: 'none', gradientDirection: null })

    editor.setShapeEffects({ gradient: '#ffffff' })
    expect(styleOf(doc, a.getId()!).gradientColor).toBe('#ffffff')
    expect(styleOf(doc, edge.getId()!)).not.toHaveProperty('gradientColor')
    expect(editor.getState().colors).toMatchObject({ gradient: '#ffffff', gradientDirection: 'south' })

    editor.setShapeEffects({ gradientDirection: 'east' })
    expect(styleOf(doc, a.getId()!).gradientDirection).toBe('east')
    editor.setShapeEffects({ gradientDirection: 'south' })
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('gradientDirection')

    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().colors).toMatchObject({ gradient: null, gradientDirection: null })
    editor.setShapeEffects({ gradientDirection: 'west' })
    editor.setShapeEffects({ gradient: 'none' })
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('gradientColor')
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('gradientDirection')
    expect(undoSteps(editor)).toBe(3 + 5)
  })

  it('leaves locked shapes as they are', () => {
    const { doc, editor, a, b } = open()
    editor.graph.setSelectionCell(a)
    editor.setLocked(true)
    editor.graph.setSelectionCells([a, b])

    editor.setShapeEffects({ shadow: true, gradient: '#dae8fc' })

    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('shadow')
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('gradientColor')
    expect(styleOf(doc, b.getId()!)).toMatchObject({ shadow: true, gradientColor: '#dae8fc' })
  })

  it('has no opacity of the fill when only edges are selected', () => {
    const { editor, edge } = open()
    editor.graph.setSelectionCell(edge)
    expect(editor.getState().colors?.fillOpacity).toBeNull()
  })

  it('fits a shape with auto width to its bold label', () => {
    const { editor } = open()
    const text = editor.addShape('text', { x: 100, y: 500 })!
    editor.graph.getDataModel().setValue(text, 'Заголовок схемы платежей')
    editor.graph.setSelectionCell(text)
    const width = text.getGeometry()!.width

    editor.toggleFontStyle('bold')

    // jsdom measures no text, so the fitted width is the same; the browser makes it wider (see e2e).
    expect(text.getGeometry()!.width).toBeGreaterThanOrEqual(width)
  })

  it('wraps the labels of the selected shapes as one undo step and turns their auto width off', () => {
    const { doc, editor, a, edge } = open()
    const text = editor.addShape('text', { x: 100, y: 500 })!
    editor.graph.setSelectionCells([a, text, edge])
    expect(editor.getState().text).toMatchObject({ textWrap: false, autoWidth: false })

    editor.setTextWrap(true)

    expect(styleOf(doc, a.getId()!).whiteSpace).toBe('wrap')
    expect(styleOf(doc, text.getId()!).whiteSpace).toBe('wrap')
    expect(styleOf(doc, text.getId()!)).not.toHaveProperty('autosize')
    expect(styleOf(doc, edge.getId()!)).not.toHaveProperty('whiteSpace')
    expect(editor.getState().text).toMatchObject({ textWrap: true, autoWidth: false })
    editor.undo()
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('whiteSpace')
    expect(styleOf(doc, text.getId()!)).not.toHaveProperty('whiteSpace')
    expect(styleOf(doc, text.getId()!).autosize).toBe(true)
  })

  it('turns the wrap off, and auto width turns it off as well', () => {
    const { doc, editor, a } = open()
    editor.graph.setSelectionCell(a)
    expect(editor.graph.isWrapping(a)).toBe(false)
    editor.setTextWrap(true)

    editor.setTextWrap(false)
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('whiteSpace')

    editor.setTextWrap(true)
    editor.setAutoWidth(true)
    expect(styleOf(doc, a.getId()!)).not.toHaveProperty('whiteSpace')
    expect(editor.getState().text).toMatchObject({ textWrap: false, autoWidth: true })
  })

  it('offers no wrap for edges, tables and their fields', () => {
    const { editor, edge } = open()
    const table = editor.addShape('table', { x: 700, y: 100 })!

    for (const cell of [edge, table, table.getChildAt(0)]) {
      editor.graph.setSelectionCell(cell)
      expect(editor.getState().text?.textWrap).toBeNull()
    }
  })

  it('lays the label of a shape with wrap out on lines that fit its width', () => {
    // jsdom measures no text: every letter is 10 pixels wide.
    const measuring = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D)
    onTestFinished(() => measuring.mockRestore())
    const { editor, a } = open()
    const label = () => editor.graph.getView().getState(a)!.text!.value
    editor.graph.getDataModel().setValue(a, 'один два три четыре пять')
    editor.graph.setSelectionCell(a)
    expect(label()).toBe('один два три четыре пять')

    editor.setTextWrap(true)
    expect(label()).toBe('один два\nтри четыре\nпять')
    expect(editor.graph.getEditingValue(a, null)).toBe('один два три четыре пять')

    editor.setGeometry({ width: 240 })
    expect(label()).toBe('один два три четыре\nпять')
  })
})
