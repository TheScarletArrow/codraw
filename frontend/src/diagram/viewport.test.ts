import { afterEach, describe, expect, it } from 'vitest'
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

  it('reports the middle of the view in the coordinates of the diagram', () => {
    const editor = open()

    editor.centerOn({ x: 1200, y: 900 })

    expect(editor.viewportCenter().x).toBeCloseTo(1200, 0)
    expect(editor.viewportCenter().y).toBeCloseTo(900, 0)
  })
})
