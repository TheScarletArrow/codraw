import { Cell, Geometry, GraphDataModel, type CellStyle } from '@maxgraph/core'
import * as Y from 'yjs'
import type { Author } from './attribution.ts'
import { DiagramBinding, LOCAL_ORIGIN } from './binding.ts'
import { getCells, initializeDocument, LAYER_CELL_ID } from './model.ts'

export const REMOTE_ORIGIN = 'test:remote'

export interface TestClient {
  doc: Y.Doc
  model: GraphDataModel
  binding: DiagramBinding
  /** Number of transactions this client wrote with the local origin. */
  localWrites: () => number
}

/** A participant's model bound to the document; with an `author`, the cells they change keep them. */
export function createClient(doc = new Y.Doc(), author: Author | null = null): TestClient {
  initializeDocument(doc)
  const model = new GraphDataModel()
  const binding = new DiagramBinding(model, getCells(doc), LOCAL_ORIGIN, false, author)
  let writes = 0
  doc.on('afterTransaction', (transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN && transaction.changed.size > 0) writes++
  })
  return { doc, model, binding, localWrites: () => writes }
}

/** Connects documents like a sync server: every update is applied to the others while connected. */
export function connect(...docs: Y.Doc[]) {
  let online = true
  const pending: [Y.Doc, Uint8Array][] = []
  for (const doc of docs) {
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return
      for (const other of docs) {
        if (other === doc) continue
        if (online) Y.applyUpdate(other, update, REMOTE_ORIGIN)
        else pending.push([other, update])
      }
    })
  }
  for (const a of docs) for (const b of docs) if (a !== b) Y.applyUpdate(b, Y.encodeStateAsUpdate(a), REMOTE_ORIGIN)
  return {
    disconnect() {
      online = false
    },
    reconnect() {
      online = true
      pending.splice(0).forEach(([doc, update]) => Y.applyUpdate(doc, update, REMOTE_ORIGIN))
    },
  }
}

export function layer(model: GraphDataModel): Cell {
  return model.getCell(LAYER_CELL_ID)!
}

export function addVertex(model: GraphDataModel, value: string, style: CellStyle = {}, geometry = new Geometry(10, 20, 120, 60)) {
  const cell = new Cell(value, geometry, style)
  cell.setVertex(true)
  model.beginUpdate()
  try {
    model.add(layer(model), cell)
  } finally {
    model.endUpdate()
  }
  return cell
}

export function addEdge(model: GraphDataModel, source: Cell, target: Cell, value = '') {
  const edge = new Cell(value, new Geometry(), { edgeStyle: 'orthogonalEdgeStyle' })
  edge.setEdge(true)
  edge.getGeometry()!.relative = true
  model.beginUpdate()
  try {
    model.add(layer(model), edge)
    model.setTerminals(edge, source, target)
  } finally {
    model.endUpdate()
  }
  return edge
}

/** Ids of the layer children in drawing order. */
export function childIds(model: GraphDataModel): string[] {
  const parent = layer(model)
  return Array.from({ length: parent.getChildCount() }, (_, index) => parent.getChildAt(index).getId()!)
}
