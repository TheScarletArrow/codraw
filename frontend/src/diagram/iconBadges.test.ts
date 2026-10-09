import type { Cell } from '@maxgraph/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'
import { renderPage } from './renderPage.ts'
import { connect } from './testing.ts'
import { loadIconPath, loadTechIcons } from './techIcons.ts'

describe('the logos of the technologies of the shapes on the canvas', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })
  beforeAll(async () => {
    // The first load of the catalog in a test takes a while; the editors use it once loaded.
    await loadTechIcons()
  })

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса', participantId: 'alice' })
    editors.push(editor)
    return { doc, editor }
  }

  const badges = (editor: DiagramEditor, cell: Cell) => editor.graph.getCellOverlays(cell).map((overlay) => overlay.tooltip)

  it('draws the logo of the technology of a shape in its corner, the logo chosen for it, or none', async () => {
    const { editor } = open()
    const cache = editor.addShape('cache')!
    const queue = editor.addShape('queue', { x: 400, y: 0 })!
    const boundary = editor.addShape('c4-boundary', { x: 0, y: 400 })!
    editor.setElementProperties(cache.getId()!, { technology: 'Redis' })
    editor.setElementProperties(boundary.getId()!, { technology: 'Kafka' })

    await editor.iconsReady()
    expect(badges(editor, cache)).toEqual(['Redis'])
    expect(badges(editor, queue)).toEqual([])
    expect(badges(editor, boundary)).toEqual([])
    // At the top right corner, inside the shape.
    const state = editor.graph.getView().getState(cache)!
    const bounds = editor.graph.getCellOverlays(cache)[0]!.getBounds(state)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(state.x + state.width)
    expect(bounds.y).toBeGreaterThanOrEqual(state.y)

    editor.setElementProperties(cache.getId()!, { icon: 'postgresql' })
    await editor.iconsReady()
    expect(badges(editor, cache)).toEqual(['PostgreSQL'])
    editor.graph.setSelectionCell(cache)
    expect(editor.getState().properties).toMatchObject({ target: 'shape', icon: 'postgresql' })

    editor.setElementProperties(cache.getId()!, { icon: 'none' })
    await editor.iconsReady()
    expect(badges(editor, cache)).toEqual([])

    editor.setElementProperties(cache.getId()!, { icon: null, technology: 'Kafka, Kotlin' })
    await editor.iconsReady()
    expect(badges(editor, cache)).toEqual(['Apache Kafka'])
    editor.undo()
    await editor.iconsReady()
    expect(badges(editor, cache)).toEqual([])
  })

  it('draws the badges into the images of the page, and of the other pages', async () => {
    const { doc, editor } = open()
    const cache = editor.addShape('cache')!
    editor.setElementProperties(cache.getId()!, { technology: 'Redis' })
    await editor.iconsReady()

    const image = editor.exportSvg()!
    expect(image.svg).toMatch(/<image[^>]+data:image\/svg\+xml;base64,/)

    const other = await renderPage(doc, editor.pageId)
    expect(other!.svg).toMatch(/<image[^>]+data:image\/svg\+xml;base64,/)
  })

  it('shows the badges to a participant who may only view, as another participant changes the technology', async () => {
    const { doc, editor } = open()
    const viewer = open({ doc: new Y.Doc(), readOnly: true })
    connect(doc, viewer.doc)
    const cache = editor.addShape('cache')!
    editor.setElementProperties(cache.getId()!, { technology: 'Redis' })

    await vi.waitFor(async () => {
      const shown = viewer.editor.graph.getDataModel().getCell(cache.getId()!)
      expect(shown).toBeTruthy()
      await viewer.editor.iconsReady()
      expect(badges(viewer.editor, shown!)).toEqual(['Redis'])
    })
  })

  it('adds a logo as a picture named by it, once it is loaded', async () => {
    const { editor } = open()
    expect(editor.addLogo('no-such-logo')).toBeNull()
    await loadIconPath('kotlin')

    const logo = editor.addLogo('kotlin')!

    expect(logo.getValue()).toBe('Kotlin')
    const style = logo.getStyle() as Record<string, unknown>
    expect(style).toMatchObject({ shape: 'image' })
    expect(style.image).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(style.codrawShape).toBeUndefined()
    expect(editor.graph.getSelectionCell()).toBe(logo)
    editor.undo()
    expect(editor.graph.getDataModel().getCell(logo.getId()!)).toBeFalsy()
  })
})
