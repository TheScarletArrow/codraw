import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { setThemeChoice, THEME_KEY } from '../theme/theme.ts'
import { DARK_CANVAS_INK } from './canvasTheme.ts'
import { DiagramCanvas } from './DiagramCanvas.tsx'
import type { DiagramEditor } from './editor.ts'
import { DEFAULT_PAGE_ID, initializeDocument } from './model.ts'

describe('DiagramCanvas', () => {
  afterEach(() => setThemeChoice('system'))

  function renderCanvas() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const onEditor = vi.fn<(editor: DiagramEditor | null) => void>()
    render(<DiagramCanvas document={doc} pageId={DEFAULT_PAGE_ID} onEditor={onEditor} />)
    const editor = onEditor.mock.calls[0]![0]!
    const { graph } = editor
    const edge = graph.insertEdge({
      parent: graph.getDefaultParent(),
      value: '',
      source: editor.addShape('rectangle', { x: 100, y: 100 }),
      target: editor.addShape('rectangle', { x: 400, y: 100 }),
    })
    const stroke = () => graph.getView().getState(edge)!.style.strokeColor
    return { onEditor, stroke }
  }

  it('draws the page in the theme of the app from the start', () => {
    localStorage.setItem(THEME_KEY, 'dark')

    const { stroke } = renderCanvas()

    expect(stroke()).toBe(DARK_CANVAS_INK)
  })

  it('follows a change of the theme without creating the canvas again', () => {
    const { onEditor, stroke } = renderCanvas()
    expect(stroke()).toBe('#1f2328')

    act(() => setThemeChoice('dark'))
    expect(stroke()).toBe(DARK_CANVAS_INK)

    act(() => setThemeChoice('light'))
    expect(stroke()).toBe('#1f2328')
    expect(onEditor).toHaveBeenCalledTimes(1)
  })
})
