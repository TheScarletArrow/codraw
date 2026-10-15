import { Geometry, Point, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { parseDrawio } from '../drawio/parse.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { markerOf } from './edgeMarkers.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('arrowheads in the editor', () => {
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

  function shape(editor: DiagramEditor, x: number) {
    const cell = editor.addShape('service', { x: 0, y: 0 })!
    const geometry = cell.getGeometry()!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, 0, geometry.width, geometry.height))
    return cell
  }

  function edge(editor: DiagramEditor, style: Record<string, unknown> = {}) {
    const parent = editor.graph.getDefaultParent()
    return editor.graph.insertEdge({ parent, value: '', source: shape(editor, 0), target: shape(editor, 300), style })
  }

  // The own style: the merged one drops `none`.
  const style = (cell: Cell) => cell.getStyle() as Record<string, unknown>
  const markers = (cell: Cell) => ({ start: markerOf(cell.getStyle(), 'start'), end: markerOf(cell.getStyle(), 'end') })

  describe('both ends at once', () => {
    it('make the selected edges point both ways for every participant, as one undo step', () => {
      const { doc, editor } = open()
      const other = open({ doc: new Y.Doc() })
      connect(doc, other.doc)
      const first = edge(editor)
      const second = edge(editor, { endArrow: 'diamond', endFill: false })
      editor.graph.setSelectionCells([first, second])

      editor.setEdgeMarkers({ start: 'classic', end: 'classic' })

      expect(markers(first)).toEqual({ start: 'classic', end: 'classic' })
      expect(markers(second)).toEqual({ start: 'classic', end: 'classic' })
      expect(style(second).endFill).toBeUndefined()
      expect(editor.getState().edgeMarkers).toEqual({ start: 'classic', end: 'classic' })
      expect(markers(other.editor.graph.getDataModel().getCell(second.getId()!)!)).toEqual({ start: 'classic', end: 'classic' })

      editor.undo()
      expect(markers(first)).toEqual({ start: 'none', end: 'classic' })
      expect(markers(second)).toEqual({ start: 'none', end: 'diamondHollow' })
    })

    it('write the fill of hollow arrowheads', () => {
      const { editor } = open()
      const cell = edge(editor)
      editor.graph.setSelectionCell(cell)

      editor.setEdgeMarkers({ start: 'ovalHollow', end: 'none' })

      expect(style(cell)).toMatchObject({ startArrow: 'oval', startFill: false, endArrow: 'none' })
      expect(editor.getState().edgeMarkers).toEqual({ start: 'ovalHollow', end: 'none' })
    })
  })

  describe('swapping the ends', () => {
    it('moves the arrowheads with their fills and sizes and keeps where the edge goes, as one undo step', () => {
      const { editor } = open()
      const generalization = edge(editor, { startArrow: 'diamond', endArrow: 'block', endFill: false, endSize: 16 })
      const plain = edge(editor)
      generalization.getGeometry()!.points = [new Point(150, 200)]
      const ends = [generalization.getTerminal(true), generalization.getTerminal(false)]
      editor.graph.setSelectionCells([generalization, plain])

      editor.swapEdgeMarkers()

      expect(markers(generalization)).toEqual({ start: 'blockHollow', end: 'diamond' })
      expect(style(generalization)).toMatchObject({ startFill: false, startSize: 16 })
      expect(style(generalization).endFill).toBeUndefined()
      expect(style(generalization).endSize).toBeUndefined()
      expect([generalization.getTerminal(true), generalization.getTerminal(false)]).toEqual(ends)
      expect(generalization.getGeometry()!.points).toEqual([new Point(150, 200)])
      // An end without a marker of its own gives the default of the editor.
      expect(markers(plain)).toEqual({ start: 'classic', end: 'none' })

      editor.undo()
      expect(markers(generalization)).toEqual({ start: 'diamond', end: 'blockHollow' })
      expect(markers(plain)).toEqual({ start: 'none', end: 'classic' })
    })

  })

  it('keeps the new arrowheads in draw.io and back', async () => {
    const { doc, editor } = open()
    const cell = edge(editor)
    editor.graph.setSelectionCell(cell)
    editor.setEdgeMarkers({ start: 'diamondHollow', end: 'cross' })

    const xml = exportDrawio(doc)
    expect(xml).toContain('startArrow=diamond')
    expect(xml).toContain('startFill=0')
    expect(xml).toContain('endArrow=cross')

    const [page] = await parseDrawio(xml)
    const copy = page!.cells.find((record) => record.id === cell.getId())!
    expect(markerOf(copy.style, 'start')).toBe('diamondHollow')
    expect(markerOf(copy.style, 'end')).toBe('cross')
  })

  it('changes nothing in a read-only editor', () => {
    const { doc, editor } = open()
    const cell = edge(editor)
    const viewer = open({ doc, readOnly: true }).editor
    viewer.graph.setSelectionCell(viewer.graph.getDataModel().getCell(cell.getId()!)!)

    viewer.setEdgeMarkers({ start: 'classic', end: 'classic' })
    viewer.swapEdgeMarkers()

    expect(markers(cell)).toEqual({ start: 'none', end: 'classic' })
  })
})
