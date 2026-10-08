import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { LEGEND_KEY, LEGEND_SHAPE, legendSettings } from './legend.ts'
import { isLegend, legendLayoutOf } from './legendShapes.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { renderPageSvg } from './renderPage.ts'
import { connect } from './testing.ts'

describe('legends in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса', participantId: 'alice' })
    editors.push(editor)
    return { doc, editor }
  }

  const children = (editor: DiagramEditor) => editor.graph.getDefaultParent().getChildren()
  const legendOf = (editor: DiagramEditor) => children(editor).find(isLegend)!
  const shapeOf = (editor: DiagramEditor, value: string) => children(editor).find((cell) => cell.getValue() === value)!
  const labels = (editor: DiagramEditor) => legendLayoutOf(editor.graph, legendOf(editor)).rows.map((laid) => laid.row.label)
  const stored = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!)

  function connectShapes(editor: DiagramEditor, source: Cell, target: Cell, style: Record<string, unknown> = {}) {
    const graph = editor.graph
    return graph.batchUpdate(() => graph.insertEdge({ parent: graph.getDefaultParent(), source, target, style }))
  }

  it('adds a legend that lists the shapes of the page, sized to them, as one undo step', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('database', { x: 200, y: 0 })

    editor.addShape('legend', { x: 400, y: 0 })

    const legend = legendOf(editor)
    expect(legend.getValue()).toBe('Легенда')
    expect(legend.getStyle().shape).toBe(LEGEND_SHAPE)
    expect(labels(editor)).toEqual(['Сервис', 'База данных'])
    const layout = legendLayoutOf(editor.graph, legend)
    expect(legend.getGeometry()!.height).toBe(layout.height)
    expect(stored(doc, legend).geometry!.height).toBe(layout.height)
    expect(labels(other.editor)).toEqual(['Сервис', 'База данных'])
    // Its size is not the participant's to set, nor are edges to go to it.
    expect(editor.getState().geometry).toMatchObject({ canSetWidth: false, canSetHeight: false })
    expect(editor.graph.isValidSource(legend)).toBe(false)

    editor.undo()
    expect(children(editor).some(isLegend)).toBe(false)
    expect(children(other.editor).some(isLegend)).toBe(false)
  })

  it('grows with a new kind of shapes in the step that added it, and shrinks back with its undo', () => {
    const { doc, editor } = open()
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('legend', { x: 400, y: 0 })
    const legend = legendOf(editor)
    const before = legend.getGeometry()!.height

    editor.addShape('queue', { x: 0, y: 200 })

    expect(labels(editor)).toEqual(['Сервис', 'Очередь'])
    expect(legend.getGeometry()!.height).toBeGreaterThan(before)
    expect(stored(doc, legend).geometry!.height).toBe(legend.getGeometry()!.height)
    editor.undo()
    expect(labels(editor)).toEqual(['Сервис'])
    expect(legend.getGeometry()!.height).toBe(before)
  })

  it('lists what another participant draws, changing its size in the model only', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('cache', { x: 0, y: 200 })
    editor.addShape('legend', { x: 400, y: 0 })
    const height = stored(doc, legendOf(editor)).geometry!.height

    connectShapes(other.editor, shapeOf(other.editor, 'Сервис'), shapeOf(other.editor, 'Кэш'), { dashed: true })

    expect(labels(editor)).toEqual(['Сервис', 'Кэш', 'Связь, пунктир'])
    expect(legendOf(editor).getGeometry()!.height).toBeGreaterThan(height)
    // The participant who drew the edge wrote the size of their legend with it.
    expect(stored(doc, legendOf(editor)).geometry!.height).toBe(legendOf(other.editor).getGeometry()!.height)
  })

  it('names and hides items as one undo step each, which the others see', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('cache', { x: 0, y: 200 })
    editor.addShape('legend', { x: 400, y: 0 })
    const legend = legendOf(editor)
    editor.graph.setSelectionCell(legend)
    expect(editor.getState().properties).toEqual({
      target: 'legend',
      cellId: legend.getId(),
      canChange: true,
      items: [
        { key: 'shape:service', type: 'shape', defaultName: 'Сервис', name: '', hidden: false },
        { key: 'shape:cache', type: 'shape', defaultName: 'Кэш', name: '', hidden: false },
      ],
    })

    editor.setLegendItem(legend.getId()!, 'shape:cache', { name: '  Redis\n' })
    editor.setLegendItem(legend.getId()!, 'shape:service', { hidden: true })

    expect(labels(editor)).toEqual(['Redis'])
    expect(labels(other.editor)).toEqual(['Redis'])
    expect(editor.getState().properties).toMatchObject({
      items: [
        { key: 'shape:service', name: '', hidden: true },
        { key: 'shape:cache', name: 'Redis', hidden: false },
      ],
    })
    editor.undo()
    expect(labels(editor)).toEqual(['Сервис', 'Redis'])
    editor.undo()
    expect(labels(editor)).toEqual(['Сервис', 'Кэш'])
    expect(legend.getStyle()[LEGEND_KEY as never]).toBeUndefined()

    // An empty name gives the item back its own.
    editor.setLegendItem(legend.getId()!, 'shape:cache', { name: 'Redis' })
    editor.setLegendItem(legend.getId()!, 'shape:cache', { name: ' ' })
    expect(legendSettings(legend.getStyle() as Record<string, unknown>)).toEqual({ names: {}, hidden: [] })
  })

  it('takes back its size when something else sizes it, e.g. a resized group around it', () => {
    const { editor } = open()
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('legend', { x: 400, y: 0 })
    const legend = legendOf(editor)
    const { width, height } = legend.getGeometry()!
    const stretched = legend.getGeometry()!.clone()
    stretched.width = width * 2
    stretched.height = height * 3
    editor.graph.getDataModel().setGeometry(legend, stretched)
    expect(legend.getGeometry()).toMatchObject({ width, height })
  })

  it('keeps the name of an item that is not on the page for when it comes back', () => {
    const { editor } = open()
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('cache', { x: 0, y: 200 })
    editor.addShape('legend', { x: 400, y: 0 })
    const legend = legendOf(editor)
    editor.setLegendItem(legend.getId()!, 'shape:cache', { name: 'Redis' })
    editor.graph.removeCells([shapeOf(editor, 'Кэш')])
    expect(labels(editor)).toEqual(['Сервис'])
    editor.addShape('cache', { x: 0, y: 300 })
    expect(labels(editor)).toEqual(['Сервис', 'Redis'])
  })

  it('changes nothing for a viewer nor in a locked legend, and shows its items only', () => {
    const { doc, editor } = open()
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('legend', { x: 400, y: 0 })
    const legend = legendOf(editor)
    editor.graph.setSelectionCell(legend)
    editor.setLocked(true)
    editor.setLegendItem(legend.getId()!, 'shape:service', { name: 'API' })
    expect(labels(editor)).toEqual(['Сервис'])
    expect(editor.getState().properties).toMatchObject({ target: 'legend', canChange: false })

    const viewer = open({ doc, readOnly: true })
    const seen = legendOf(viewer.editor)
    viewer.editor.setLegendItem(seen.getId()!, 'shape:service', { name: 'API' })
    expect(labels(viewer.editor)).toEqual(['Сервис'])
  })

  it('draws its title, its samples and its names into an image of the page', () => {
    const { doc, editor } = open()
    editor.addShape('service', { x: 0, y: 0 })
    editor.addShape('legend', { x: 400, y: 0 })
    editor.setLegendItem(legendOf(editor).getId()!, 'shape:service', { name: 'Микросервис' })

    const svg = renderPageSvg(doc, 'page-1')!

    expect(svg).toContain('Легенда')
    expect(svg).toContain('Микросервис')
    const empty = open({ doc: new Y.Doc() })
    empty.editor.addShape('legend', { x: 0, y: 0 })
    expect(empty.editor.exportSvg()!.svg).toContain('Нет фигур и связей')
  })

  it('is no element and offers no properties of one', () => {
    const { editor } = open()
    editor.addShape('legend', { x: 0, y: 0 })
    editor.graph.setSelectionCell(legendOf(editor))
    expect(editor.getState().properties?.target).toBe('legend')
    expect(editor.selectedElement()).toBeNull()
  })
})
