import { Rectangle, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor, type LayerState } from './editor.ts'
import { LayerViews, type PageLayerView } from './layerViews.ts'
import { getCells, initializeDocument, LAYER_CELL_ID, readCell } from './model.ts'
import { renderPageSvg } from './renderPage.ts'
import { connect } from './testing.ts'

describe('layers in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({
    doc = new Y.Doc(),
    readOnly = false,
    layerView = null,
    name = 'Алиса',
  }: { doc?: Y.Doc; readOnly?: boolean; layerView?: PageLayerView | null; name?: string } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: name, participantId: name, layerView })
    editors.push(editor)
    return { doc, editor }
  }

  /** Two participants of one board. */
  function pair() {
    const alice = open()
    const bob = open({ doc: new Y.Doc(), name: 'Борис' })
    connect(alice.doc, bob.doc)
    return { alice, bob }
  }

  const layersOf = (editor: DiagramEditor) => editor.getState().layers
  const layerNamed = (editor: DiagramEditor, name: string): LayerState => layersOf(editor).find((layer) => layer.name === name)!
  const layerIdOf = (editor: DiagramEditor, cell: Cell) => {
    let current: Cell | null = cell
    while (current && current.getParent() !== editor.graph.getDataModel().getRoot()) current = current.getParent()
    return current?.getParent() ? current.getId() : null
  }
  const cellOf = (editor: DiagramEditor, id: string) => editor.graph.getDataModel().getCell(id)!
  const stored = (doc: Y.Doc, id: string) => readCell(id, getCells(doc).get(id)!)
  const selectedIds = (editor: DiagramEditor) => editor.graph.getSelectionCells().map((cell) => cell.getId())
  const connectShapes = (editor: DiagramEditor, source: Cell, target: Cell) => {
    const graph = editor.graph
    let edge: Cell | null = null
    graph.batchUpdate(() => (edge = graph.insertEdge({ parent: graph.getDefaultParent(), source, target })))
    return edge! as Cell
  }

  it('shows the main layer of a page, active, until the participant adds another', () => {
    const { editor } = open()
    editor.addShape('service', { x: 0, y: 0 })

    expect(layersOf(editor)).toEqual([
      expect.objectContaining({ id: LAYER_CELL_ID, name: 'Основной слой', main: true, active: true, elements: 1, visible: true }),
    ])
  })

  it('adds a layer on top, active, as one undo step that everybody sees, and new shapes go into it', () => {
    const { alice, bob } = pair()

    const id = alice.editor.addLayer()!
    const shape = alice.editor.addShape('database', { x: 0, y: 0 })!

    expect(layersOf(alice.editor).map((layer) => [layer.name, layer.active])).toEqual([
      ['Слой 2', true],
      ['Основной слой', false],
    ])
    expect(stored(alice.doc, id)).toMatchObject({ kind: 'layer', parent: '0', value: 'Слой 2' })
    expect(stored(alice.doc, shape.getId()!).parent).toBe(id)
    // The active layer is the participant's own.
    expect(layersOf(bob.editor).map((layer) => [layer.name, layer.active])).toEqual([
      ['Слой 2', false],
      ['Основной слой', true],
    ])
    alice.editor.undo()
    alice.editor.undo()
    expect(layersOf(bob.editor).map((layer) => layer.id)).toEqual([LAYER_CELL_ID])
  })

  it('names new layers by their number, past the names that are taken', () => {
    const { editor } = open()
    editor.addLayer()
    editor.renameLayer(layersOf(editor)[0]!.id, 'Слой 3')
    editor.addLayer()

    expect(layersOf(editor).map((layer) => layer.name)).toEqual(['Слой 4', 'Слой 3', 'Основной слой'])
  })

  it('renames a layer in one line, and an empty name gives it its name by default', () => {
    const { alice, bob } = pair()
    const id = alice.editor.addLayer()!

    alice.editor.renameLayer(id, '  Инфра\nструктура  ')
    expect(layerNamed(bob.editor, 'Инфра структура').ownName).toBe('Инфра структура')
    alice.editor.renameLayer(LAYER_CELL_ID, 'Бизнес')
    alice.editor.renameLayer(LAYER_CELL_ID, '   ')
    expect(layersOf(bob.editor)[1]).toMatchObject({ name: 'Основной слой', ownName: '' })
  })

  it('moves a layer up and down, and its shapes are drawn over the shapes of the layers under it', () => {
    const { alice, bob } = pair()
    const notes = alice.editor.addLayer()!
    alice.editor.setActiveLayer(LAYER_CELL_ID)

    alice.editor.moveLayer(notes, 'down')
    expect(layersOf(bob.editor).map((layer) => layer.id)).toEqual([LAYER_CELL_ID, notes])
    alice.editor.moveLayer(notes, 'down')
    alice.editor.moveLayer(notes, 'up')
    expect(layersOf(bob.editor).map((layer) => layer.id)).toEqual([notes, LAYER_CELL_ID])
    alice.editor.undo()
    expect(layersOf(bob.editor).map((layer) => layer.id)).toEqual([LAYER_CELL_ID, notes])
  })

  it('hides a layer on this canvas only: its shapes and the edges that end at them leave the canvas and the selection', () => {
    const doc = new Y.Doc()
    const views = new LayerViews()
    const alice = open({ doc, layerView: views.page('page-1') })
    const bob = open({ doc: new Y.Doc(), name: 'Борис' })
    connect(alice.doc, bob.doc)
    const service = alice.editor.addShape('service', { x: 0, y: 0 })!
    const infra = alice.editor.addLayer()!
    const database = alice.editor.addShape('database', { x: 300, y: 0 })!
    const edge = connectShapes(alice.editor, service, database)
    alice.editor.selectAll()
    const updates = vi.fn()
    alice.doc.on('update', updates)

    alice.editor.setLayerVisible(infra, false)

    expect(alice.editor.graph.getView().getState(database)).toBeFalsy()
    expect(alice.editor.graph.getView().getState(edge)).toBeFalsy()
    expect(selectedIds(alice.editor)).toEqual([service.getId()])
    expect(updates).not.toHaveBeenCalled()
    expect(views.page('page-1').visibility(infra)).toBe(false)
    expect(layerNamed(alice.editor, 'Слой 2')).toMatchObject({ visible: false, ownVisibility: false, hiddenForAll: false })
    expect(bob.editor.graph.getView().getState(cellOf(bob.editor, database.getId()!))).toBeTruthy()
    // Nothing of it is selected, and new shapes go into the main layer meanwhile.
    alice.editor.selectAll()
    expect(selectedIds(alice.editor)).toEqual([service.getId()])
    expect(layerNamed(alice.editor, 'Основной слой').active).toBe(true)
    // Undo does not show it again; showing it does, with its edge.
    alice.editor.undo()
    expect(layerNamed(alice.editor, 'Слой 2').visible).toBe(false)
    alice.editor.setLayerVisible(infra, true)
    expect(alice.editor.graph.getView().getState(database)).toBeTruthy()
    expect(views.page('page-1').visibility(infra)).toBeUndefined()
  })

  it('hides a layer for everybody as one undo step, and a participant may still show it for themselves', () => {
    const { alice, bob } = pair()
    const notes = alice.editor.addLayer()!
    const sticky = alice.editor.addShape('sticky', { x: 0, y: 0 })!

    alice.editor.setLayerHidden(notes, true)

    const theirs = cellOf(bob.editor, sticky.getId()!)
    expect(bob.editor.graph.getView().getState(theirs)).toBeFalsy()
    expect(layerNamed(bob.editor, 'Слой 2')).toMatchObject({ visible: false, hiddenForAll: true, ownVisibility: null })
    expect(layerNamed(alice.editor, 'Слой 2').visible).toBe(false)
    bob.editor.setLayerVisible(notes, true)
    expect(layerNamed(bob.editor, 'Слой 2')).toMatchObject({ visible: true, hiddenForAll: true, ownVisibility: true })
    expect(layerNamed(alice.editor, 'Слой 2').visible).toBe(false)
    alice.editor.undo()
    expect(layerNamed(alice.editor, 'Слой 2')).toMatchObject({ visible: true, hiddenForAll: false })
  })

  it('locks a layer for everybody: its shapes are neither selected nor changed, and a press goes to the canvas', () => {
    const { alice, bob } = pair()
    const zones = alice.editor.addLayer()!
    const zone = alice.editor.addShape('rectangle', { x: 0, y: 0 })!
    alice.editor.setActiveLayer(LAYER_CELL_ID)
    const service = alice.editor.addShape('service', { x: 300, y: 0 })!
    alice.editor.selectAll()

    alice.editor.setLayerLocked(zones, true)

    expect(selectedIds(alice.editor)).toEqual([service.getId()])
    expect(layerNamed(bob.editor, 'Слой 2')).toMatchObject({ locked: true, lockedBy: 'Алиса' })
    const theirs = cellOf(bob.editor, zone.getId()!)
    const graph = bob.editor.graph
    expect(graph.isCellSelectable(theirs)).toBe(false)
    expect(graph.isCellLocked(theirs)).toBe(true)
    expect(graph.isCellDeletable(theirs)).toBe(false)
    expect(graph.getEventState(graph.getView().getState(theirs)!)).toBeNull()
    bob.editor.selectAll()
    expect(selectedIds(bob.editor)).toEqual([service.getId()])
    graph.selectRegion(new Rectangle(-1000, -1000, 3000, 3000), new MouseEvent('mouseup'))
    expect(selectedIds(bob.editor)).toEqual([service.getId()])
    // New shapes do not go into it, and it cannot be removed.
    bob.editor.setActiveLayer(zones)
    expect(layerNamed(bob.editor, 'Основной слой').active).toBe(true)
    bob.editor.deleteLayer(zones, null)
    expect(layersOf(alice.editor)).toHaveLength(2)

    alice.editor.setLayerLocked(zones, false)
    expect(graph.isCellSelectable(theirs)).toBe(true)
    expect(layerNamed(bob.editor, 'Слой 2').active).toBe(true)
  })

  it('moves the selection with the edges between its shapes into a layer, at their places, as one undo step', () => {
    const { alice, bob } = pair()
    const service = alice.editor.addShape('service', { x: 0, y: 0 })!
    const database = alice.editor.addShape('database', { x: 300, y: 0 })!
    const queue = alice.editor.addShape('queue', { x: 0, y: 300 })!
    const edge = connectShapes(alice.editor, service, database)
    const other = connectShapes(alice.editor, service, queue)
    const infra = alice.editor.addLayer()!
    const before = service.getGeometry()!.clone()
    alice.editor.graph.setSelectionCells([service, database])

    expect(layerNamed(alice.editor, 'Слой 2').canMoveSelection).toBe(true)
    alice.editor.moveSelectionToLayer(infra)

    for (const id of [service, database, edge].map((cell) => cell.getId()!)) {
      expect(layerIdOf(bob.editor, cellOf(bob.editor, id))).toBe(infra)
    }
    // The edge to a shape that stays stays in its layer, and still connects them.
    expect(layerIdOf(bob.editor, cellOf(bob.editor, other.getId()!))).toBe(LAYER_CELL_ID)
    expect(cellOf(bob.editor, other.getId()!).getTerminal(true)!.getId()).toBe(service.getId())
    expect(cellOf(bob.editor, service.getId()!).getGeometry()).toMatchObject({ x: before.x, y: before.y })
    expect(layerNamed(alice.editor, 'Слой 2')).toMatchObject({ elements: 3, selected: 2, canMoveSelection: false })
    alice.editor.undo()
    expect(layerIdOf(bob.editor, cellOf(bob.editor, service.getId()!))).toBe(LAYER_CELL_ID)
  })

  it('leaves locked shapes in their layer and moves nothing into a locked layer', () => {
    const { editor } = open()
    const service = editor.addShape('service', { x: 0, y: 0 })!
    const database = editor.addShape('database', { x: 300, y: 0 })!
    editor.graph.setSelectionCell(database)
    editor.setLocked(true)
    const infra = editor.addLayer()!
    editor.graph.setSelectionCells([service, database])

    editor.moveSelectionToLayer(infra)
    expect(layerIdOf(editor, service)).toBe(infra)
    expect(layerIdOf(editor, database)).toBe(LAYER_CELL_ID)

    const notes = editor.addLayer()!
    editor.setLayerLocked(notes, true)
    expect(layerNamed(editor, 'Слой 3').canMoveSelection).toBe(false)
    editor.graph.setSelectionCell(service)
    editor.moveSelectionToLayer(notes)
    expect(layerIdOf(editor, service)).toBe(infra)
  })

  it('removes a layer moving its shapes into another one, as one undo step', () => {
    const { alice, bob } = pair()
    const notes = alice.editor.addLayer()!
    const sticky = alice.editor.addShape('sticky', { x: 0, y: 0 })!

    alice.editor.deleteLayer(notes, LAYER_CELL_ID)

    expect(layersOf(bob.editor).map((layer) => layer.id)).toEqual([LAYER_CELL_ID])
    expect(layerIdOf(bob.editor, cellOf(bob.editor, sticky.getId()!))).toBe(LAYER_CELL_ID)
    alice.editor.undo()
    expect(layerIdOf(bob.editor, cellOf(bob.editor, sticky.getId()!))).toBe(notes)
  })

  it('removes a layer with its shapes and the edges of other layers that end at them, and undo brings them back', () => {
    const { alice, bob } = pair()
    const service = alice.editor.addShape('service', { x: 0, y: 0 })!
    const infra = alice.editor.addLayer()!
    const database = alice.editor.addShape('database', { x: 300, y: 0 })!
    alice.editor.setActiveLayer(LAYER_CELL_ID)
    const edge = connectShapes(alice.editor, service, database)
    expect(layerIdOf(alice.editor, edge)).toBe(LAYER_CELL_ID)

    alice.editor.deleteLayer(infra, null)

    expect(getCells(bob.doc).has(database.getId()!)).toBe(false)
    expect(getCells(bob.doc).has(edge.getId()!)).toBe(false)
    expect(getCells(bob.doc).has(service.getId()!)).toBe(true)
    alice.editor.undo()
    expect(cellOf(bob.editor, edge.getId()!).getTerminal(false)!.getId()).toBe(database.getId())
  })

  it('removes neither the main layer nor the shapes of a layer with a locked shape', () => {
    const { editor } = open()
    const notes = editor.addLayer()!
    const sticky = editor.addShape('sticky', { x: 0, y: 0 })!
    editor.graph.setSelectionCell(sticky)
    editor.setLocked(true)

    expect(layerNamed(editor, 'Слой 2').holdsLocked).toBe(true)
    editor.deleteLayer(LAYER_CELL_ID, notes)
    editor.deleteLayer(notes, null)
    expect(layersOf(editor)).toHaveLength(2)
    editor.deleteLayer(notes, LAYER_CELL_ID)
    expect(layersOf(editor)).toHaveLength(1)
    expect(layerIdOf(editor, sticky)).toBe(LAYER_CELL_ID)
  })

  it('removes an empty layer at once', () => {
    const { editor } = open()
    const notes = editor.addLayer()!

    editor.deleteLayer(notes, null)

    expect(layersOf(editor).map((layer) => layer.id)).toEqual([LAYER_CELL_ID])
    expect(layerNamed(editor, 'Основной слой').active).toBe(true)
  })

  it('lets a participant who may only view hide layers for themselves and nothing else', () => {
    const { alice } = pair()
    const notes = alice.editor.addLayer()!
    alice.editor.addShape('sticky', { x: 0, y: 0 })
    const viewer = open({ doc: new Y.Doc(), readOnly: true })
    connect(alice.doc, viewer.doc)
    const updates = vi.fn()
    viewer.doc.on('update', updates)

    viewer.editor.setLayerVisible(notes, false)
    viewer.editor.addLayer()
    viewer.editor.renameLayer(notes, 'Заметки')
    viewer.editor.setLayerLocked(notes, true)
    viewer.editor.deleteLayer(notes, null)

    expect(layerNamed(viewer.editor, 'Слой 2')).toMatchObject({ visible: false, canMoveSelection: false })
    expect(layersOf(viewer.editor)).toHaveLength(2)
    expect(updates).not.toHaveBeenCalled()
  })

  it('shows the layer of an element that the participant goes to', () => {
    const { editor } = open()
    const notes = editor.addLayer()!
    const sticky = editor.addShape('sticky', { x: 0, y: 0 })!
    editor.setLayerVisible(notes, false)

    expect(editor.revealCell(sticky.getId()!)).toBe(true)

    expect(layerNamed(editor, 'Слой 2').visible).toBe(true)
    expect(selectedIds(editor)).toEqual([sticky.getId()])
  })

  it('draws into an image what the canvas shows, and names it for the diagram of the image', () => {
    const { editor, doc } = open()
    const service = editor.addShape('service', { x: 0, y: 0 })!
    const infra = editor.addLayer()!
    editor.addShape('database', { x: 300, y: 0 })

    expect(editor.exportSvg()!.cellIds).toBeNull()
    editor.setLayerVisible(infra, false)
    const image = editor.exportSvg()!
    expect(image.cellIds).toEqual([service.getId()])
    expect(image.svg).not.toContain('База данных')
    // The live image shows the layers visible for everybody.
    expect(renderPageSvg(doc, 'page-1')).toContain('База данных')
    editor.setLayerHidden(infra, true)
    expect(renderPageSvg(doc, 'page-1')).not.toContain('База данных')
  })

  it('keeps an edge drawn between shapes of two layers in the layer it was drawn in', () => {
    const { editor } = open()
    const service = editor.addShape('service', { x: 0, y: 0 })!
    editor.addLayer()
    const database = editor.addShape('database', { x: 300, y: 0 })!
    const edge = connectShapes(editor, database, service)

    expect(layerIdOf(editor, edge)).toBe(layersOf(editor)[0]!.id)
    editor.graph.setSelectionCell(service)
    editor.moveSelectionToLayer(layersOf(editor)[0]!.id)
    expect(layerIdOf(editor, edge)).toBe(layersOf(editor)[0]!.id)
  })
})
