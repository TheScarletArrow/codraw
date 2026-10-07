import { SelectionCellsHandler, type Cell, type VertexHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { clipboard } from './clipboard.ts'
import { createDiagramEditor, type DiagramEditor, type DiagramEditorOptions } from './editor.ts'
import { retryPictures } from './extensions.ts'
import { boardImageOf, boardImageUrl, IMAGE_PLACEHOLDER, type ImageHost } from './images.ts'
import { getCells, initializeDocument } from './model.ts'

const BOARD = '0199a000-0000-7000-8000-000000000001'
const OTHER = '0199a000-0000-7000-8000-000000000002'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** A host of the board {@link BOARD} that stores pictures of the sizes it is given, in turn, and refuses `refused` ones. */
function fakeHost(sizes: [number, number][], refused: string[] = []): ImageHost {
  let next = 0
  return {
    store: vi.fn(async (image: Blob) => {
      if (refused.includes(image.type)) return null
      const [width, height] = sizes[next++ % sizes.length]!
      return { url: boardImageUrl(BOARD, `0199a000-0000-7000-8000-00000000010${next}`), width, height }
    }),
    holds: (url) => boardImageOf(url)?.boardId === BOARD,
  }
}

const png = (name = 'shot.png') => new File(['png'], name, { type: 'image/png' })

let editors: DiagramEditor[] = []

function setup(options: DiagramEditorOptions = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const doc = new Y.Doc()
  initializeDocument(doc)
  const editor = createDiagramEditor(container, doc, options)
  editors.push(editor)
  return { editor, doc, container }
}

const shapes = (editor: DiagramEditor): Cell[] => editor.graph.getDefaultParent().getChildren()

const box = (cell: Cell) => {
  const { x, y, width, height } = cell.getGeometry()!
  return { x, y, width, height }
}

afterEach(() => {
  editors.forEach((editor) => editor.destroy())
  editors = []
  document.body.innerHTML = ''
})

describe('images on the canvas', () => {
  it('are stored, then added in a row around the point as one undo step, and selected', async () => {
    const images = fakeHost([
      [1920, 1080],
      [100, 50],
    ])
    const { editor, doc } = setup({ images })
    expect(editor.getState().canAddImages).toBe(true)

    await editor.addImages([png('a.png'), png('b.png')], { x: 500, y: 300 })

    expect(images.store).toHaveBeenCalledTimes(2)
    const [first, second] = shapes(editor)
    expect(first!.getStyle()).toMatchObject({ shape: 'image', aspect: 'fixed', image: boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000101') })
    // 600 + 20 + 100 wide, its middle at the point and snapped to the grid; the smaller one in the middle of the row.
    expect(box(first!)).toEqual({ x: 140, y: 130, width: 600, height: 338 })
    expect(box(second!)).toEqual({ x: 760, y: 274, width: 100, height: 50 })
    expect(editor.graph.getSelectionCells()).toEqual([first, second])
    const stored = [...getCells(doc).values()].filter((cell) => cell.get('kind') === 'vertex')
    expect(stored).toHaveLength(2)

    editor.undo()
    expect(shapes(editor)).toHaveLength(0)
  })

  it('leave out the files that were not stored, and nothing is added without any', async () => {
    const images = fakeHost([[10, 10]], ['image/svg+xml'])
    const { editor } = setup({ images })

    await editor.addImages([new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })])
    expect(shapes(editor)).toHaveLength(0)
    expect(editor.getState().canUndo).toBe(false)

    await editor.addImages([new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), png()])
    expect(shapes(editor)).toHaveLength(1)
  })

  it('cannot be added without a host or by a participant who only views', async () => {
    const images = fakeHost([[10, 10]])
    const without = setup().editor
    const viewer = setup({ images, readOnly: true }).editor

    expect(without.getState().canAddImages).toBe(false)
    expect(viewer.getState().canAddImages).toBe(false)
    await without.addImages([png()])
    await viewer.addImages([png()])

    expect(images.store).not.toHaveBeenCalled()
    expect(shapes(without)).toHaveLength(0)
    expect(shapes(viewer)).toHaveLength(0)
  })

  it('come from a paste of a picture without text, while text with a picture of it is pasted as text', async () => {
    const images = fakeHost([[40, 20]])
    const { editor } = setup({ images })

    editor.paste(undefined, '', '', [png()])
    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(1))
    expect(shapes(editor)[0]!.getStyle().shape).toBe('image')

    editor.paste(undefined, 'Имя\tТип', '<table><tr><td>Имя</td></tr></table>', [png()])
    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(2))
    expect(shapes(editor)[1]!.getValue()).toBe('Имя\tТип')
    expect(images.store).toHaveBeenCalledTimes(1)
  })

  it('copied from another board are stored on this one when pasted, and the clipboard keeps them as copied', async () => {
    const foreign = boardImageUrl(OTHER, '0199a000-0000-7000-8000-0000000000aa')
    const source = setup({ images: fakeHost([[10, 10]]) }).editor
    const picture = source.graph.insertVertex({
      parent: source.graph.getDefaultParent(),
      value: 'Логотип',
      position: [0, 0],
      size: [80, 40],
      style: { shape: 'image', image: foreign },
    })
    source.graph.setSelectionCell(picture)
    source.copy()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })))
    const images = fakeHost([[80, 40]])
    const { editor } = setup({ images })

    editor.paste()

    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(1))
    expect(shapes(editor)[0]!.getStyle().image).toBe(boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000101'))
    expect(shapes(editor)[0]!.getValue()).toBe('Логотип')
    expect(clipboard.read()![0]!.getStyle().image).toBe(foreign)
    vi.unstubAllGlobals()
  })

  it('keep their proportions when one side is set, and the handles keep them unless Shift is held', async () => {
    const { editor } = setup({ images: fakeHost([[200, 100]]) })
    await editor.addImages([png()], { x: 100, y: 100 })
    const [image] = shapes(editor)

    editor.setGeometry({ width: 300 })
    expect(box(image!)).toMatchObject({ width: 300, height: 150 })
    editor.setGeometry({ height: 50 })
    expect(box(image!)).toMatchObject({ width: 100, height: 50 })

    const handler = editor.graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')!.getHandler(image!) as VertexHandler
    const press = (shiftKey: boolean) => ({ getEvent: () => ({ shiftKey }) }) as never
    expect(handler.isConstrainedEvent(press(false))).toBe(true)
    expect(handler.isConstrainedEvent(press(true))).toBe(false)
    const rectangle = editor.addShape('rectangle')!
    const rectangleHandler = editor.graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')!.getHandler(rectangle) as VertexHandler
    expect(rectangleHandler.isConstrainedEvent(press(false))).toBe(false)
    expect(rectangleHandler.isConstrainedEvent(press(true))).toBe(true)
  })

  it('show a placeholder when the picture does not load, and load again once the browser is online', async () => {
    const { editor, container } = setup({ images: fakeHost([[30, 30]]) })
    await editor.addImages([png()])
    const picture = container.querySelector('image')!
    const url = picture.getAttributeNS(XLINK_NS, 'href')
    expect(url).toContain(`/api/boards/${BOARD}/images/`)

    picture.dispatchEvent(new Event('error'))
    expect(picture.getAttributeNS(XLINK_NS, 'href')).toBe(IMAGE_PLACEHOLDER)
    expect(picture.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')

    retryPictures(document)
    expect(picture.getAttributeNS(XLINK_NS, 'href')).toBe(url)
    expect(picture.getAttribute('preserveAspectRatio')).toBe('none')
    // Again, should it fail again.
    picture.dispatchEvent(new Event('error'))
    expect(picture.getAttributeNS(XLINK_NS, 'href')).toBe(IMAGE_PLACEHOLDER)
  })
})
