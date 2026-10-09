import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { DiagramCanvas } from './DiagramCanvas.tsx'
import { createDiagramEditor } from './editor.ts'
import type { ImageHost } from './images.ts'
import { COMPONENT_DRAG_TYPE } from '../libraries/drag.ts'
import { SHAPE_DRAG_TYPE } from './shapes.ts'

vi.mock('./editor.ts', () => ({ createDiagramEditor: vi.fn() }))

const host: ImageHost = { store: vi.fn(), holds: () => false }

function renderCanvas(readOnly = false, images: ImageHost | null = host, onDropComponent?: DropComponent): FakeEditor {
  const editor = createFakeEditor({ readOnly })
  vi.mocked(createDiagramEditor).mockReturnValue(editor)
  // jsdom has no events of dragging, which would carry the point.
  vi.mocked(editor.toDiagramPoint).mockReturnValue({ x: 60, y: 80 })
  render(
    <DiagramCanvas
      document={new Y.Doc()}
      pageId="page-1"
      readOnly={readOnly}
      images={images}
      onEditor={() => {}}
      onDropComponent={onDropComponent}
    />,
  )
  return editor
}

type DropComponent = NonNullable<Parameters<typeof DiagramCanvas>[0]['onDropComponent']>

/** A drag of files, or of a shape of the palette, over the canvas. */
function transfer(files: File[], shape?: string) {
  return {
    types: [...(files.length > 0 ? ['Files'] : []), ...(shape ? [SHAPE_DRAG_TYPE] : [])],
    files,
    getData: (type: string) => (type === SHAPE_DRAG_TYPE ? (shape ?? '') : ''),
    dropEffect: 'none',
  }
}

afterEach(() => vi.mocked(createDiagramEditor).mockReset())

describe('DiagramCanvas', () => {
  it('gives the editor the host of images of the page', () => {
    renderCanvas()

    expect(createDiagramEditor).toHaveBeenCalledWith(expect.any(HTMLElement), expect.any(Y.Doc), expect.objectContaining({ images: host }))
  })

  it('adds dropped files as images at the point where they are dropped', () => {
    const editor = renderCanvas()
    const canvas = screen.getByTestId('diagram-canvas')
    const files = [new File(['png'], 'logo.png', { type: 'image/png' })]
    const dataTransfer = transfer(files)

    fireEvent.dragOver(canvas, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')
    const dropped = fireEvent.drop(canvas, { dataTransfer })

    expect(dropped).toBe(false)
    expect(editor.addImages).toHaveBeenCalledWith(files, { x: 60, y: 80 })
  })

  it('adds a dragged shape of the palette, as before', () => {
    const editor = renderCanvas()

    fireEvent.drop(screen.getByTestId('diagram-canvas'), { dataTransfer: transfer([], 'ellipse') })

    expect(editor.addShape).toHaveBeenCalledWith('ellipse', { x: 60, y: 80 })
    expect(editor.addImages).not.toHaveBeenCalled()
  })

  it('keeps files dropped by a participant who only views from the browser, and adds nothing', () => {
    const editor = renderCanvas(true, null)
    const canvas = screen.getByTestId('diagram-canvas')
    const dataTransfer = transfer([new File(['png'], 'logo.png', { type: 'image/png' })])

    const over = fireEvent.dragOver(canvas, { dataTransfer })
    expect(over).toBe(false)
    expect(dataTransfer.dropEffect).toBe('none')
    expect(fireEvent.drop(canvas, { dataTransfer })).toBe(false)

    expect(editor.addImages).not.toHaveBeenCalled()
  })

  it('gives the page a dragged component of a library with the point of the drop, once the page takes them', () => {
    const onDropComponent = vi.fn<DropComponent>()
    const editor = renderCanvas(false, host, onDropComponent)
    const canvas = screen.getByTestId('diagram-canvas')
    const data = JSON.stringify({ libraryId: 'l1', componentId: 'c1' })
    const dataTransfer = { types: [COMPONENT_DRAG_TYPE], files: [], getData: (type: string) => (type === COMPONENT_DRAG_TYPE ? data : ''), dropEffect: 'none' }

    fireEvent.dragOver(canvas, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')
    fireEvent.drop(canvas, { dataTransfer })

    expect(onDropComponent).toHaveBeenCalledWith(editor, data, { x: 60, y: 80 })
    expect(editor.addShape).not.toHaveBeenCalled()
  })
})
