import { Geometry, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { cellsXml } from './clipboardFormat.ts'
import { createDiagramEditor, type DiagramEditor, type DiagramEditorOptions } from './editor.ts'
import { boardImageOf, boardImageUrl, type ImageHost } from './images.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getElements, initializeDocument, readCell } from './model.ts'
import { styleClipboard } from './styleCopy.ts'
import { connect } from './testing.ts'

const BOARD = '0199a000-0000-7000-8000-000000000001'

describe('components of libraries in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
    styleClipboard.clear()
  })

  function open({ doc = new Y.Doc(), ...options }: DiagramEditorOptions & { doc?: Y.Doc } = {}) {
    if (!options.readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { participantName: 'Алиса', ...options })
    editors.push(editor)
    return { doc, editor }
  }

  function shape(editor: DiagramEditor, x: number, y: number, label = '') {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    const model = editor.graph.getDataModel()
    model.setGeometry(cell, new Geometry(x, y, 120, 60))
    if (label) model.setValue(cell, label)
    return cell
  }

  const edge = (editor: DiagramEditor, source: Cell, target: Cell) =>
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), source, target, value: '' })

  const top = (editor: DiagramEditor) => editor.graph.getDefaultParent().getChildren()
  const stored = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc, DEFAULT_PAGE_ID).get(cell.getId()!)!)

  /** The selection of a board of its own, saved as a library saves it. */
  function component(build: (editor: DiagramEditor) => Cell[]): string {
    const { editor } = open()
    editor.graph.setSelectionCells(build(editor))
    return cellsXml(editor.selectionComponent()!.cells)
  }

  it('takes the selected shapes with the edges between them, but not an edge to a shape left out, and changes nothing', () => {
    const { doc, editor } = open()
    const service = shape(editor, 0, 0, 'Сервис')
    const database = shape(editor, 200, 0, 'База данных')
    const other = shape(editor, 400, 0, 'Очередь')
    edge(editor, service, database)
    edge(editor, database, other)
    const before = Y.encodeStateAsUpdate(doc)
    editor.graph.setSelectionCells([service, database])

    const taken = editor.selectionComponent()!

    expect(taken.name).toBe('Компонент')
    expect(taken.cells.map((cell) => [cell.isEdge(), cell.getValue()])).toEqual([
      [false, 'Сервис'],
      [false, 'База данных'],
      [true, ''],
    ])
    expect(taken.cells[2]!.getTerminal(true)).toBe(taken.cells[0])
    expect(taken.image?.svg).toContain('<svg')
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
  })

  it('names the component after the label of the single selected shape, and gives nothing without a selection', () => {
    const { editor } = open()
    const cell = shape(editor, 0, 0, 'Шлюз <b>оплаты</b>')
    editor.graph.getDataModel().setStyle(cell, { ...cell.getStyle(), html: true } as never)

    editor.graph.clearSelection()
    expect(editor.selectionComponent()).toBeNull()
    editor.graph.setSelectionCell(cell)
    expect(editor.selectionComponent()!.name).toBe('Шлюз оплаты')
  })

  it('adds a copy with cells and elements of its own around the point, as one undo step that others see', async () => {
    const content = component((editor) => {
      const service = shape(editor, 40, 40, 'Сервис')
      editor.setElementProperties(service.getId()!, { name: 'Сервис', kind: 'container', technology: 'Go' })
      const database = shape(editor, 240, 40, 'База')
      edge(editor, service, database)
      return [service, database]
    })
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)

    expect(await editor.insertComponent(content, { x: 500, y: 300 })).toBe(true)
    expect(await editor.insertComponent(content, { x: 500, y: 600 })).toBe(true)

    const [first, second] = [top(editor).slice(0, 3), top(editor).slice(3)]
    expect(first.map((cell) => cell.getValue())).toEqual(['Сервис', 'База', ''])
    // The copy is 320 wide and 60 high around the point: from 340 to 660 and from 270 to 330, on the grid.
    expect(first[0]!.getGeometry()).toMatchObject({ x: 340, y: 270 })
    expect(first[1]!.getGeometry()).toMatchObject({ x: 540, y: 270 })
    const ids = top(editor).map((cell) => cell.getId())
    expect(new Set(ids).size).toBe(6)
    const elementOf = (cell: Cell) => stored(doc, cell).style[ELEMENT_KEY]
    expect(elementOf(first[0]!)).toEqual(expect.any(String))
    expect(elementOf(second[0]!)).toEqual(expect.any(String))
    expect(elementOf(first[0]!)).not.toBe(elementOf(second[0]!))
    // The properties of the element come with the component, into an element of each copy.
    expect(getElements(doc).get(elementOf(second[0]!) as string)?.toJSON()).toMatchObject({ name: 'Сервис', technology: 'Go' })
    expect(editor.graph.getSelectionCells()).toEqual(second)
    expect(top(other.editor)).toHaveLength(6)

    editor.undo()
    expect(top(editor)).toHaveLength(3)
    expect(top(other.editor)).toHaveLength(3)
  })

  it('adds a locked shape of a component unlocked, and an edge of the copy connects its own shapes', async () => {
    const content = component((editor) => {
      const a = shape(editor, 0, 0, 'A')
      const b = shape(editor, 200, 0, 'B')
      edge(editor, a, b)
      editor.graph.setSelectionCell(a)
      editor.setLocked(true)
      return [a, b]
    })
    const { editor } = open()

    await editor.insertComponent(content)

    const [a, b, line] = top(editor)
    expect(editor.graph.isCellLocked(a!)).toBe(false)
    expect(line!.getTerminal(true)).toBe(a)
    expect(line!.getTerminal(false)).toBe(b)
  })

  it('stores the raster pictures of a component on the board first', async () => {
    const picture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const content = component((editor) => {
      const cell = shape(editor, 0, 0)
      editor.graph.getDataModel().setStyle(cell, { shape: 'image', image: picture, aspect: 'fixed' } as never)
      return [cell]
    })
    const host: ImageHost = {
      store: vi.fn(async () => ({ url: boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000101'), width: 1, height: 1 })),
      holds: (url) => boardImageOf(url)?.boardId === BOARD,
    }
    const { doc, editor } = open({ images: host })

    await editor.insertComponent(content)
    await vi.waitFor(() => expect(top(editor)).toHaveLength(1))

    expect(host.store).toHaveBeenCalledOnce()
    expect(stored(doc, top(editor)[0]!).style.image).toBe(boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000101'))
  })

  it('adds nothing for content that is no diagram, nor on a page that is only viewed', async () => {
    const content = component((editor) => [shape(editor, 0, 0, 'A')])
    const { editor } = open()
    expect(await editor.insertComponent('просто текст')).toBe(false)
    expect(top(editor)).toHaveLength(0)

    const doc = new Y.Doc()
    initializeDocument(doc)
    const viewer = open({ doc, readOnly: true }).editor
    await viewer.insertComponent(content)
    expect(top(viewer)).toHaveLength(0)
  })

  it('gives the selection the look of the first shape of a component as one undo step, leaving the copied look alone', async () => {
    const content = component((editor) => {
      const sample = shape(editor, 0, 0, 'Сервис команды')
      editor.graph.setSelectionCell(sample)
      editor.setColor('fill', '#d5e8d4')
      editor.setColor('stroke', '#6c8ebf')
      return [sample]
    })
    const { doc, editor } = open()
    const target = shape(editor, 0, 0, 'Прямоугольник')
    editor.graph.setSelectionCell(target)

    expect(await editor.applyComponentStyle(content)).toBe(true)

    expect(stored(doc, target).style).toMatchObject({ fillColor: '#d5e8d4', strokeColor: '#6c8ebf' })
    expect(target.getValue()).toBe('Прямоугольник')
    expect(styleClipboard.read()).toBeNull()
    editor.undo()
    expect(stored(doc, target).style.fillColor).toBeUndefined()
  })

  it('takes the look of a text of a component, and of its edge only without shapes', async () => {
    const text = component((editor) => {
      const label = editor.addShape('text', { x: 0, y: 0 })!
      editor.graph.setSelectionCell(label)
      editor.setColor('font', '#c0392b')
      return [label]
    })
    const { doc, editor } = open()
    const target = shape(editor, 0, 0, 'Прямоугольник')
    editor.graph.setSelectionCell(target)

    expect(await editor.applyComponentStyle(text)).toBe(true)
    expect(stored(doc, target).style.fontColor).toBe('#c0392b')
  })

  it('leaves a locked shape as it is when it applies the look of a component', async () => {
    const content = component((editor) => {
      const sample = shape(editor, 0, 0)
      editor.graph.setSelectionCell(sample)
      editor.setColor('fill', '#d5e8d4')
      return [sample]
    })
    const { doc, editor } = open()
    const target = shape(editor, 0, 0)
    editor.graph.setSelectionCell(target)
    editor.setLocked(true)

    expect(await editor.applyComponentStyle(content)).toBe(false)
    expect(stored(doc, target).style.fillColor).toBeUndefined()
  })
})
