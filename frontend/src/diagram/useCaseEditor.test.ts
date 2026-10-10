import { Geometry, type Cell, type ConnectionHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { parseDrawio } from '../drawio/parse.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { HOLLOW_TRIANGLE, markerOf } from './edgeMarkers.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'
import type { ShapeId } from './shapes.ts'
import { connect } from './testing.ts'
import { relationOf } from './useCase.ts'

describe('use cases in the editor', () => {
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

  function shape(editor: DiagramEditor, id: ShapeId, x: number, y = 0) {
    const cell = editor.addShape(id, { x: 0, y: 0 })!
    const geometry = cell.getGeometry()!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, y, geometry.width, geometry.height))
    return cell
  }

  /** Draws an edge from `source` to `target` as dragging from a connection point does. */
  function draw(editor: DiagramEditor, source: Cell, target: Cell, value = '') {
    const handler = editor.graph.getPlugin<ConnectionHandler>('ConnectionHandler')!
    const model = editor.graph.getDataModel()
    model.beginUpdate()
    try {
      return handler.insertEdge(editor.graph.getDefaultParent(), '', value, source, target, {})
    } finally {
      model.endUpdate()
    }
  }

  // The own style: the merged one drops `none`.
  const style = (cell: Cell) => cell.getStyle() as Record<string, unknown>
  const relation = (cell: Cell) => relationOf(style(cell), String(cell.getValue() ?? ''))

  describe('markers of UML', () => {
    it('give an end the hollow triangle, shown in the choice and seen by the other participant, as one undo step', () => {
      const { doc, editor } = open()
      const other = open({ doc: new Y.Doc() })
      connect(doc, other.doc)
      const edge = draw(editor, shape(editor, 'service', 0), shape(editor, 'service', 300))
      editor.graph.setSelectionCell(edge)

      editor.setEdgeMarker('end', HOLLOW_TRIANGLE)

      expect(edge.getStyle()).toMatchObject({ endArrow: 'block', endFill: false })
      expect(editor.getState().edgeMarkers).toEqual({ start: 'none', end: HOLLOW_TRIANGLE })
      const copy = other.editor.graph.getDataModel().getCell(edge.getId()!)!
      expect(copy.getStyle()).toMatchObject({ endArrow: 'block', endFill: false })

      editor.undo()
      expect(edge.getStyle().endArrow).toBeUndefined()
      expect(edge.getStyle().endFill).toBeUndefined()
    })

    it('remove the fill of a hollow triangle when another marker takes its place', () => {
      const { editor } = open()
      const edge = draw(editor, shape(editor, 'service', 0), shape(editor, 'service', 300))
      editor.graph.setSelectionCell(edge)
      editor.setEdgeMarker('start', HOLLOW_TRIANGLE)

      editor.setEdgeMarker('start', 'open')

      expect(edge.getStyle()).toMatchObject({ startArrow: 'open' })
      expect(edge.getStyle().startFill).toBeUndefined()
      expect(editor.getState().edgeMarkers).toEqual({ start: 'open', end: 'classic' })
    })
  })

  describe('new edges', () => {
    it('between an actor and a use case either way round are associations, without markers', () => {
      const { editor } = open()
      const actor = shape(editor, 'uml-actor', 0)
      const useCase = shape(editor, 'uml-use-case', 200)

      expect(style(draw(editor, actor, useCase)).endArrow).toBe('none')
      expect(style(draw(editor, useCase, actor)).endArrow).toBe('none')
    })

    it('between other shapes keep the arrow of the editor', () => {
      const { editor } = open()
      const first = shape(editor, 'uml-use-case', 0)
      const second = shape(editor, 'uml-use-case', 300)

      expect(markerOf(style(draw(editor, first, second)), 'end')).toBe('classic')
      const ellipse = shape(editor, 'ellipse', 300, 200)
      expect(markerOf(style(draw(editor, shape(editor, 'uml-actor', 0, 200), ellipse)), 'end')).toBe('classic')
    })

    it('made by quick connect from an actor to a use case are associations', () => {
      const { editor } = open()
      const actor = shape(editor, 'uml-actor', 0)
      editor.graph.setSelectionCell(actor)

      expect(editor.getState().quickConnect?.shapes).toEqual(['uml-actor', 'uml-use-case'])
      const useCase = editor.addConnectedShape('right', 'uml-use-case')!

      const edge = useCase.getEdges()[0]!
      expect(edge.getTerminal(true)).toBe(actor)
      expect(style(edge).endArrow).toBe('none')
      // Actor to actor: the arrow, for a generalization to be chosen.
      editor.graph.setSelectionCell(actor)
      const second = editor.addConnectedShape('left', 'uml-actor')!
      expect(markerOf(style(second.getEdges()[0]!), 'end')).toBe('classic')
    })
  })

  describe('the relation', () => {
    it('is offered for edges of actors and use cases and for relations of use cases, not for other edges', () => {
      const { editor } = open()
      const association = draw(editor, shape(editor, 'uml-actor', 0), shape(editor, 'uml-use-case', 200))
      const services = draw(editor, shape(editor, 'service', 0, 300), shape(editor, 'service', 300, 300))

      editor.graph.setSelectionCell(association)
      expect(editor.getState().edgeRelation).toEqual({ value: 'association' })
      editor.graph.setSelectionCell(services)
      expect(editor.getState().edgeRelation).toBeNull()

      // An inclusion between ellipses of draw.io, which are no use cases of the palette.
      const include = draw(editor, shape(editor, 'ellipse', 0, 600), shape(editor, 'ellipse', 300, 600), '<<include>>')
      editor.graph.getDataModel().setStyle(include, { ...include.getStyle(), dashed: true, endArrow: 'open' })
      editor.graph.setSelectionCell(include)
      expect(editor.getState().edgeRelation).toEqual({ value: 'include' })
    })

    it('makes an inclusion with its line, marker and stereotype as one undo step that the other participant sees', () => {
      const { doc, editor } = open()
      const other = open({ doc: new Y.Doc() })
      connect(doc, other.doc)
      const edge = draw(editor, shape(editor, 'uml-use-case', 0), shape(editor, 'uml-use-case', 300))
      editor.graph.setSelectionCell(edge)

      editor.setEdgeRelation('include')

      expect(edge.getStyle()).toMatchObject({ dashed: true, endArrow: 'open', endSize: 12 })
      expect(edge.getValue()).toBe('«include»')
      expect(editor.getState().edgeRelation).toEqual({ value: 'include' })
      const copy = other.editor.graph.getDataModel().getCell(edge.getId()!)!
      expect(relation(copy)).toBe('include')

      editor.undo()
      expect(edge.getValue()).toBe('')
      expect(edge.getStyle().dashed).toBeUndefined()
      expect(relation(edge)).toBeNull()
    })

    it('makes a generalization and keeps a label of its own, removing a stereotype', () => {
      const { editor } = open()
      const actors = [shape(editor, 'uml-actor', 0), shape(editor, 'uml-actor', 200)] as const
      const labelled = draw(editor, actors[0], actors[1], '1..*')
      const stereotyped = draw(editor, actors[1], actors[0], '«extend»')
      editor.graph.setSelectionCells([labelled, stereotyped])

      editor.setEdgeRelation('generalization')

      expect(labelled.getValue()).toBe('1..*')
      expect(stereotyped.getValue()).toBe('')
      for (const edge of [labelled, stereotyped]) {
        expect(edge.getStyle()).toMatchObject({ endArrow: 'block', endFill: false, endSize: 16 })
        expect(relation(edge)).toBe('generalization')
      }
    })

    it('is empty for different relations, and the choice makes them one', () => {
      const { editor } = open()
      const actor = shape(editor, 'uml-actor', 0)
      const association = draw(editor, actor, shape(editor, 'uml-use-case', 200))
      const generalization = draw(editor, shape(editor, 'uml-actor', 0, 300), actor)
      editor.graph.setSelectionCell(generalization)
      editor.setEdgeRelation('generalization')
      editor.graph.setSelectionCells([association, generalization])

      expect(editor.getState().edgeRelation).toEqual({ value: null })

      editor.setEdgeRelation('association')
      expect(editor.getState().edgeRelation).toEqual({ value: 'association' })
    })

    it('leaves locked edges as they are, and a reader cannot change it', () => {
      const { doc, editor } = open()
      const edge = draw(editor, shape(editor, 'uml-actor', 0), shape(editor, 'uml-use-case', 200))
      editor.graph.setSelectionCell(edge)
      editor.setLocked(true)

      editor.setEdgeRelation('extend')
      expect(relation(edge)).toBe('association')

      const reader = open({ doc: new Y.Doc(), readOnly: true })
      connect(doc, reader.doc)
      const copy = reader.editor.graph.getDataModel().getCell(edge.getId()!)!
      reader.editor.graph.setSelectionCell(copy)
      reader.editor.setEdgeRelation('extend')
      expect(relation(copy)).toBe('association')
    })
  })

  it('go to draw.io and come back with their shapes and relations', async () => {
    const { doc, editor } = open()
    const actor = shape(editor, 'uml-actor', 0)
    const parent = shape(editor, 'uml-actor', 0, 200)
    const order = shape(editor, 'uml-use-case', 200)
    const login = shape(editor, 'uml-use-case', 500)
    const coupon = shape(editor, 'uml-use-case', 500, 200)
    shape(editor, 'uml-system-boundary', 180, -40)
    const relations = {
      association: draw(editor, actor, order),
      include: draw(editor, order, login),
      extend: draw(editor, coupon, order),
      generalization: draw(editor, parent, actor),
    }
    for (const [name, edge] of Object.entries(relations)) {
      editor.graph.setSelectionCell(edge)
      editor.setEdgeRelation(name as keyof typeof relations)
    }

    const xml = exportDrawio(doc)
    expect(xml).toContain('shape=umlActor')
    expect(xml).toContain('endArrow=block')
    expect(xml).toContain('endFill=0')
    expect(xml).toContain('endArrow=open')

    const [page] = await parseDrawio(xml)
    for (const [name, edge] of Object.entries(relations)) {
      const parsed = page!.cells.find((cell) => cell.id === edge.getId())!
      expect(relationOf(parsed.style, parsed.value)).toBe(name)
    }
    const boundary = page!.cells.find((cell) => cell.value === 'Система')!
    expect(boundary.style).toMatchObject({ codrawShape: 'uml-system-boundary', pointerEvents: false })
  })
})
