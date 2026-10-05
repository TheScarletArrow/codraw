import { Geometry, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { parseDrawio } from '../drawio/parse.ts'
import { exportDrawioPage } from '../drawio/serialize.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { DEFAULT_PAGE_ID, initializeDocument } from './model.ts'
import { embedDiagram, IMAGE_BACKGROUND, IMAGE_BORDER } from './svgExport.ts'

describe('image export', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc)
    editors.push(editor)
    return { doc, editor }
  }

  /** Adds a rectangle of 100 by 60 at the point with a label. */
  function shape(editor: DiagramEditor, x: number, y: number, label: string): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    const model = editor.graph.getDataModel()
    model.setGeometry(cell, new Geometry(x, y, 100, 60))
    model.setValue(cell, label)
    return cell
  }

  const connect = (editor: DiagramEditor, source: Cell, target: Cell) =>
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source, target })

  it('draws the whole page at 100% with margins on white, whatever the zoom', () => {
    const { editor } = open()
    shape(editor, 0, 0, 'Сервис')
    shape(editor, 200, 100, 'База')
    editor.zoomIn()

    const image = editor.exportSvg()!

    // The lines of the shapes stick out of them by a pixel or two.
    expect(image.width - 300 - 2 * IMAGE_BORDER).toBeOneOf([0, 1, 2])
    expect(image.height - 160 - 2 * IMAGE_BORDER).toBeOneOf([0, 1, 2])
    expect(image.cellIds).toBeNull()
    expect(image.svg).toContain(`<rect width="100%" height="100%" fill="${IMAGE_BACKGROUND}"/>`)
    expect(image.svg).toContain('Сервис')
    expect(image.svg).toContain('База')
  })

  it('leaves the background out of a transparent image', () => {
    const { editor } = open()
    shape(editor, 0, 0, 'Сервис')

    expect(editor.exportSvg({ transparent: true })!.svg).not.toContain('<rect width="100%"')
  })

  it('has no image of an empty page', () => {
    const { editor } = open()

    expect(editor.getState().hasCells).toBe(false)
    expect(editor.exportSvg()).toBeNull()
  })

  it('draws the selected shapes with the edges between them, as copying takes them', () => {
    const { editor } = open()
    const service = shape(editor, 0, 0, 'Сервис')
    const database = shape(editor, 200, 0, 'База')
    const queue = shape(editor, 400, 0, 'Очередь')
    const link = connect(editor, service, database)
    connect(editor, database, queue)
    editor.graph.setSelectionCells([service, database])
    expect(editor.getState().canCopy).toBe(true)

    const image = editor.exportSvg({ selectionOnly: true })!

    expect(image.cellIds).toEqual([service.getId(), database.getId(), link.getId()])
    expect(image.width - 300 - 2 * IMAGE_BORDER).toBeOneOf([0, 1, 2])
    expect(image.svg).not.toContain('Очередь')
  })

  it('draws a selected field with its table and a selected shape of a group with the group', () => {
    const { editor } = open()
    const table = editor.addShape('table', { x: 100, y: 100 })!
    const a = shape(editor, 400, 0, 'A')
    const b = shape(editor, 600, 0, 'B')
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!
    editor.graph.setSelectionCells([table.getChildAt(0), a])

    expect(editor.exportSvg({ selectionOnly: true })!.cellIds).toEqual([table.getId(), group.getId()])
  })

  it('has nothing of a selection without shapes', () => {
    const { editor } = open()
    const edge = connect(editor, shape(editor, 0, 0, 'A'), shape(editor, 200, 0, 'B'))
    editor.graph.setSelectionCell(edge)

    expect(editor.getState().canCopy).toBe(false)
    expect(editor.exportSvg({ selectionOnly: true })).toBeNull()
  })

  it('carries the diagram of what it draws, which the import of draw.io files reads', async () => {
    const { doc, editor } = open()
    const service = shape(editor, 0, 0, 'Сервис')
    const database = shape(editor, 200, 0, 'База')
    shape(editor, 400, 0, 'Очередь')
    connect(editor, service, database)
    editor.graph.setSelectionCells([service, database])
    const image = editor.exportSvg({ selectionOnly: true })!

    const svg = embedDiagram(image.svg, exportDrawioPage(doc, DEFAULT_PAGE_ID, image.cellIds!)!)
    const [page] = await parseDrawio(svg)

    expect(page!.cells.filter((cell) => cell.kind === 'vertex').map((cell) => cell.value)).toEqual(['Сервис', 'База'])
    expect(page!.cells.filter((cell) => cell.kind === 'edge')).toHaveLength(1)
  })
})
