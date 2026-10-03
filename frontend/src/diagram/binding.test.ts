import { Cell, Geometry, GraphDataModel } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBinding } from './binding.ts'
import { getCells, initializeDocument, LAYER_CELL_ID, orderBetween, readCell, writeCell, type CellData } from './model.ts'
import { addEdge, addVertex, childIds, connect, createClient, layer, REMOTE_ORIGIN } from './testing.ts'

const vertexData = (id: string, overrides: Partial<CellData> = {}): CellData => ({
  id,
  kind: 'vertex',
  parent: LAYER_CELL_ID,
  order: orderBetween(null, null),
  value: 'Box',
  geometry: { x: 10, y: 20, width: 120, height: 60 },
  source: null,
  target: null,
  style: { fillColor: '#dae8fc' },
  ...overrides,
})

/** Writes to the document as another participant would. */
function remote(doc: Y.Doc, change: (cells: ReturnType<typeof getCells>) => void) {
  doc.transact(() => change(getCells(doc)), REMOTE_ORIGIN)
}

describe('Yjs → maxGraph (remote changes)', () => {
  it('loads cells that are already in the document', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    remote(doc, (cells) => writeCell(cells, vertexData('box', { value: 'Существующая' })))

    const { model } = createClient(doc)

    expect(model.getCell('box')?.getValue()).toBe('Существующая')
  })

  it('adds a vertex with its value, geometry and style', () => {
    const { doc, model } = createClient()

    remote(doc, (cells) => writeCell(cells, vertexData('box', { value: 'Сервис', style: { fillColor: '#fff', rounded: true } })))

    const cell = model.getCell('box')!
    expect(cell.isVertex()).toBe(true)
    expect(cell.getParent()?.getId()).toBe(LAYER_CELL_ID)
    expect(cell.getValue()).toBe('Сервис')
    expect(cell.getGeometry()).toMatchObject({ x: 10, y: 20, width: 120, height: 60 })
    expect(cell.getStyle()).toEqual({ fillColor: '#fff', rounded: true })
  })

  it('updates value, geometry and style', () => {
    const { doc, model } = createClient()
    remote(doc, (cells) => writeCell(cells, vertexData('box')))

    remote(doc, (cells) =>
      writeCell(cells, vertexData('box', { value: 'Новое', geometry: { x: 5, y: 6, width: 7, height: 8 }, style: { fillColor: '#000' } })),
    )

    const cell = model.getCell('box')!
    expect(cell.getValue()).toBe('Новое')
    expect(cell.getGeometry()).toMatchObject({ x: 5, y: 6, width: 7, height: 8 })
    expect(cell.getStyle()).toEqual({ fillColor: '#000' })
  })

  it('connects an edge to its terminals, including ones created in the same transaction', () => {
    const { doc, model } = createClient()

    remote(doc, (cells) => {
      writeCell(cells, { ...vertexData('edge'), kind: 'edge', source: 'a', target: 'b', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true } })
      writeCell(cells, vertexData('a'))
      writeCell(cells, vertexData('b'))
    })

    const edge = model.getCell('edge')!
    expect(edge.isEdge()).toBe(true)
    expect(edge.getTerminal(true)?.getId()).toBe('a')
    expect(edge.getTerminal(false)?.getId()).toBe('b')
  })

  it('removes deleted cells', () => {
    const { doc, model } = createClient()
    remote(doc, (cells) => writeCell(cells, vertexData('box')))

    remote(doc, (cells) => cells.delete('box'))

    expect(model.getCell('box')).toBeFalsy()
  })

  it('orders children by their order keys', () => {
    const { doc, model } = createClient()
    const first = orderBetween(null, null)
    const second = orderBetween(first, null)

    remote(doc, (cells) => {
      writeCell(cells, vertexData('b', { order: second }))
      writeCell(cells, vertexData('a', { order: first }))
    })
    expect(childIds(model)).toEqual(['a', 'b'])

    remote(doc, (cells) => writeCell(cells, vertexData('a', { order: orderBetween(second, null) })))
    expect(childIds(model)).toEqual(['b', 'a'])
  })

  it('does not write remote changes back to the document', () => {
    const client = createClient()

    remote(client.doc, (cells) => writeCell(cells, vertexData('box')))
    remote(client.doc, (cells) => writeCell(cells, vertexData('box', { value: 'Изменено' })))

    expect(client.localWrites()).toBe(0)
  })
})

describe('maxGraph → Yjs (local changes)', () => {
  it('propagates a new vertex to the other participant', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)

    const cell = addVertex(alice.model, 'Сервис', { fillColor: '#dae8fc', rounded: true })

    const copy = bob.model.getCell(cell.getId()!)!
    expect(copy.getValue()).toBe('Сервис')
    expect(copy.getGeometry()).toMatchObject({ x: 10, y: 20, width: 120, height: 60 })
    expect(copy.getStyle()).toEqual({ fillColor: '#dae8fc', rounded: true })
  })

  it('gives new cells globally unique ids', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)

    const a = addVertex(alice.model, 'A')
    const b = addVertex(bob.model, 'B')

    expect(a.getId()).not.toBe(b.getId())
    expect(childIds(alice.model)).toEqual(childIds(bob.model))
  })

  it('gives an id to cells inserted with an empty id, as maxGraph does for new edges', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const a = addVertex(alice.model, 'A')
    const b = addVertex(alice.model, 'B')
    const edge = new Cell('', new Geometry(), {})
    edge.setEdge(true)
    edge.setId('')

    alice.model.beginUpdate()
    alice.model.add(layer(alice.model), edge)
    alice.model.setTerminals(edge, a, b)
    alice.model.endUpdate()

    expect(edge.getId()).toMatch(/^[0-9a-f-]{36}$/)
    expect(bob.model.getCell(edge.getId()!)?.getTerminal(false)?.getId()).toBe(b.getId())
  })

  it('propagates geometry, style and value changes', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const cell = addVertex(alice.model, 'Сервис')

    alice.model.setGeometry(cell, new Geometry(300, 200, 150, 80))
    alice.model.setStyle(cell, { fillColor: '#f8cecc' })
    alice.model.setValue(cell, 'База данных')

    const copy = bob.model.getCell(cell.getId()!)!
    expect(copy.getGeometry()).toMatchObject({ x: 300, y: 200, width: 150, height: 80 })
    expect(copy.getStyle()).toEqual({ fillColor: '#f8cecc' })
    expect(copy.getValue()).toBe('База данных')
  })

  it('propagates edges and reconnected terminals', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const a = addVertex(alice.model, 'A')
    const b = addVertex(alice.model, 'B')
    const c = addVertex(alice.model, 'C')

    const edge = addEdge(alice.model, a, b, 'зависит')
    expect(bob.model.getCell(edge.getId()!)?.getTerminal(false)?.getId()).toBe(b.getId())

    alice.model.setTerminal(edge, c, false)
    const copy = bob.model.getCell(edge.getId()!)!
    expect(copy.getTerminal(true)?.getId()).toBe(a.getId())
    expect(copy.getTerminal(false)?.getId()).toBe(c.getId())
    expect(copy.getValue()).toBe('зависит')
  })

  it('propagates removals', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const a = addVertex(alice.model, 'A')
    const b = addVertex(alice.model, 'B')
    const edge = addEdge(alice.model, a, b)

    alice.model.beginUpdate()
    alice.model.remove(edge)
    alice.model.remove(a)
    alice.model.endUpdate()

    expect(bob.model.getCell(a.getId()!)).toBeFalsy()
    expect(bob.model.getCell(edge.getId()!)).toBeFalsy()
    expect(bob.model.getCell(b.getId()!)).toBeTruthy()
  })

  it('keeps the drawing order on both sides', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)
    const a = addVertex(alice.model, 'A')
    const b = addVertex(alice.model, 'B')
    addVertex(alice.model, 'C')

    // Bring A to front, after C.
    alice.model.add(alice.model.getCell(LAYER_CELL_ID), a, 2)

    expect(childIds(alice.model)).toEqual([b.getId(), expect.any(String), a.getId()])
    expect(childIds(bob.model)).toEqual(childIds(alice.model))
  })

  it('writes one transaction per model edit and does not echo remote changes', () => {
    const alice = createClient()
    const bob = createClient()
    connect(alice.doc, bob.doc)

    const cell = addVertex(alice.model, 'A')
    alice.model.beginUpdate()
    alice.model.setValue(cell, 'B')
    alice.model.setStyle(cell, { fillColor: '#000' })
    alice.model.endUpdate()

    expect(alice.localWrites()).toBe(2)
    expect(bob.localWrites()).toBe(0)
  })

  it('merges concurrent changes of different properties of one cell', () => {
    const alice = createClient()
    const bob = createClient()
    const network = connect(alice.doc, bob.doc)
    const cell = addVertex(alice.model, 'Сервис', { fillColor: '#dae8fc' })
    const id = cell.getId()!

    network.disconnect()
    alice.model.setStyle(cell, { fillColor: '#f8cecc' })
    bob.model.setGeometry(bob.model.getCell(id)!, new Geometry(400, 300, 120, 60))
    network.reconnect()

    for (const client of [alice, bob]) {
      const copy = client.model.getCell(id)!
      expect(copy.getStyle()).toEqual({ fillColor: '#f8cecc' })
      expect(copy.getGeometry()).toMatchObject({ x: 400, y: 300 })
    }
    expect(readCell(id, getCells(alice.doc).get(id)!)).toEqual(readCell(id, getCells(bob.doc).get(id)!))
  })

  it('stops syncing after destroy', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const model = new GraphDataModel()
    const binding = new DiagramBinding(model, getCells(doc))

    binding.destroy()
    remote(doc, (cells) => writeCell(cells, vertexData('box')))
    addVertex(model, 'local')

    expect(model.getCell('box')).toBeFalsy()
    expect(getCells(doc).size).toBe(3)
  })
})
