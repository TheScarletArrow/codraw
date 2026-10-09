import * as Y from 'yjs'
import { isAttributedWrite, writeAttribution, type Author } from '../diagram/attribution.ts'
import { INTERACTION_KEY } from '../diagram/elementKinds.ts'
import { newId } from '../diagram/ids.ts'
import {
  ELEMENT_KEY,
  ELEMENT_STYLE_KEYS,
  compareCells,
  deleteCell,
  dropUnusedElements,
  elementIdOf,
  getCells,
  LAYER_CELL_ID,
  layerIds,
  orderBetween,
  readCell,
  writeCell,
  type CellData,
  type StyleValue,
} from '../diagram/model.ts'
import { isTableIndexStyle, isTableStyle, TABLE_INDEX_KEY, type ShapeStyle } from '../diagram/shapes.ts'
import { SOURCE_KEY, sourceOf } from '../diagram/sources.ts'
import { parseFieldLabel } from '../sql/erDiagram.ts'
import { plainText } from '../sql/tableField.ts'
import { splitIndex } from '../sql/tableIndex.ts'

/** Origin of applying a schema import to a proposal draft. */
export const SCHEMA_IMPORT_UPDATE_ORIGIN = 'codraw:schema-import-update'

export interface SchemaImportUpdate {
  pageId: string
  cells: CellData[]
}

export interface SchemaUpdateSummary {
  added: number
  removed: number
  changed: number
  matchedByName: string[]
}

const ELEMENT_PROPERTY_KEYS = new Set<string>(Object.values(ELEMENT_STYLE_KEYS))
const DATA_STYLE_KEYS = new Set<string>([
  SOURCE_KEY,
  ELEMENT_KEY,
  ...ELEMENT_PROPERTY_KEYS,
  INTERACTION_KEY,
  TABLE_INDEX_KEY,
  'codrawApi',
])

const hasGeometry = (cell: CellData): cell is CellData & { geometry: NonNullable<CellData['geometry']> } => cell.geometry !== null

/** The cells of a page, as plain data. */
function pageCells(doc: Y.Doc, pageId: string): CellData[] {
  return Array.from(getCells(doc, pageId).entries(), ([id, cell]) => readCell(id, cell))
}

function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function displayName(cell: CellData): string {
  const named = cell.style.codrawName
  if (typeof named === 'string' && named.trim() !== '') return named.trim()
  return plainText(cell.value).split('\n')[0]?.trim() || cell.id
}

function category(cell: CellData): string {
  if (cell.kind === 'vertex' && isTableStyle(cell.style as ShapeStyle)) return 'table'
  const shape = cell.style.codrawShape ?? cell.style.shape
  return typeof shape === 'string' && shape !== '' ? `shape:${shape}` : cell.kind
}

function rootKey(cell: CellData): string | null {
  const name = displayName(cell)
  return name ? `${category(cell)}:${clean(name)}` : null
}

function childKey(cell: CellData): string | null {
  const source = sourceOf(cell)
  if (source) return `source:${source}`
  if (isTableIndexStyle(cell.style)) {
    const index = splitIndex(cell.value)
    return index ? `index:${clean(index.name)}` : null
  }
  const field = parseFieldLabel(cell.value)
  if (field) return `field:${clean(field.name)}`
  const name = displayName(cell)
  return name ? `${category(cell)}:${clean(name)}` : null
}

function sourcePrefix(source: string): string {
  return source.split(':')[0] ?? source
}

function singleMap<T extends CellData>(cells: T[], keyOf: (cell: T) => string | null): Map<string, T> {
  const grouped = new Map<string, T[]>()
  for (const cell of cells) {
    const key = keyOf(cell)
    if (!key) continue
    grouped.set(key, [...(grouped.get(key) ?? []), cell])
  }
  return new Map([...grouped].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]!]))
}

interface RootPlan {
  matches: Map<string, string>
  scopedExisting: Set<string>
  matchedByName: string[]
}

function planRoots(existing: CellData[], imported: CellData[]): RootPlan {
  // The tables of the page in any of its layers.
  const layers = layerIds(existing)
  const existingRoots = existing.filter((cell) => cell.parent !== null && layers.has(cell.parent) && cell.kind === 'vertex')
  const importedRoots = imported.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex')
  const importedPrefixes = new Set(importedRoots.flatMap((cell) => (sourceOf(cell) ? [sourcePrefix(sourceOf(cell)!)] : [])))
  const importedCategories = new Set(importedRoots.map(category))
  const scopedExisting = new Set(
    existingRoots
      .filter((cell) => {
        const source = sourceOf(cell)
        return source ? importedPrefixes.has(sourcePrefix(source)) : importedCategories.has(category(cell))
      })
      .map((cell) => cell.id),
  )

  const matches = new Map<string, string>()
  const usedExisting = new Set<string>()
  const existingBySource = singleMap(existingRoots, sourceOf)
  const importedBySource = singleMap(importedRoots, sourceOf)
  for (const [source, importedCell] of importedBySource) {
    const existingCell = existingBySource.get(source)
    if (!existingCell) continue
    matches.set(importedCell.id, existingCell.id)
    usedExisting.add(existingCell.id)
    scopedExisting.add(existingCell.id)
  }

  const unmatchedImported = importedRoots.filter((cell) => !matches.has(cell.id))
  const unmatchedExisting = existingRoots.filter((cell) => scopedExisting.has(cell.id) && !usedExisting.has(cell.id))
  const existingByName = singleMap(unmatchedExisting, rootKey)
  const importedByName = singleMap(unmatchedImported, rootKey)
  const matchedByName: string[] = []
  for (const [key, importedCell] of importedByName) {
    const existingCell = existingByName.get(key)
    if (!existingCell) continue
    matches.set(importedCell.id, existingCell.id)
    usedExisting.add(existingCell.id)
    scopedExisting.add(existingCell.id)
    matchedByName.push(displayName(existingCell))
  }
  return { matches, scopedExisting, matchedByName }
}

/** A human-sized summary of what the update would change on a page. */
export function summarizeSchemaUpdate(existing: CellData[], imported: CellData[]): SchemaUpdateSummary {
  const plan = planRoots(existing, imported)
  const importedRoots = imported.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex')
  const matchedExisting = new Set(plan.matches.values())
  return {
    added: importedRoots.filter((cell) => !plan.matches.has(cell.id)).length,
    removed: [...plan.scopedExisting].filter((id) => !matchedExisting.has(id)).length,
    changed: plan.matches.size,
    matchedByName: plan.matchedByName,
  }
}

function sourceAwareStyle(existing: Record<string, StyleValue>, imported: Record<string, StyleValue>): Record<string, StyleValue> {
  const style = { ...existing }
  for (const key of DATA_STYLE_KEYS) {
    if (key === ELEMENT_KEY) continue
    if (imported[key] === undefined) delete style[key]
    else style[key] = imported[key]!
  }
  const element = elementIdOf(existing) ?? elementIdOf(imported)
  if (element) style[ELEMENT_KEY] = element
  return style
}

function matchedCell(existing: CellData, imported: CellData, id: string, parent: string | null): CellData {
  return {
    ...imported,
    id,
    parent,
    order: existing.order,
    geometry: existing.geometry,
    style: sourceAwareStyle(existing.style, imported.style),
  }
}

function edgeStyle(existing: Record<string, StyleValue>, imported: Record<string, StyleValue>): Record<string, StyleValue> {
  return { ...existing, ...imported }
}

function matchedEdge(existing: CellData, imported: CellData, source: string | null, target: string | null): CellData {
  return {
    ...imported,
    id: existing.id,
    parent: existing.parent,
    order: existing.order,
    geometry: existing.geometry,
    source,
    target,
    style: edgeStyle(existing.style, imported.style),
  }
}

function edgeKey(cell: CellData): string | null {
  const source = sourceOf(cell)
  if (source) return `source:${source}`
  if (!cell.source || !cell.target) return null
  const style = Object.fromEntries(
    Object.entries(cell.style).filter(([key]) =>
      ['startArrow', 'endArrow', 'dashed', 'strokeWidth', 'codrawTechnology', 'codrawInteraction'].includes(key),
    ),
  )
  return `${cell.source}->${cell.target}:${cell.value}:${JSON.stringify(style)}`
}

function directChildren(cells: CellData[], parent: string): CellData[] {
  return cells.filter((cell) => cell.parent === parent && cell.kind === 'vertex').sort(compareCells)
}

function descendants(cells: CellData[], parent: string): CellData[] {
  const children = cells.filter((cell) => cell.parent === parent)
  return children.flatMap((cell) => [cell, ...descendants(cells, cell.id)])
}

function rootOf(cells: CellData[]): Map<string, string> {
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const layers = layerIds(cells)
  const root = new Map<string, string>()
  for (const cell of cells) {
    let current: CellData | undefined = cell
    while (current?.parent && !layers.has(current.parent)) current = byId.get(current.parent)
    if (current?.parent && layers.has(current.parent)) root.set(cell.id, current.id)
  }
  return root
}

function newGeometryOffset(importedRoot: CellData, imported: CellData[], plan: RootPlan, existingById: Map<string, CellData>): { x: number; y: number } | null {
  const importedRootOf = rootOf(imported)
  const offsets: { x: number; y: number }[] = []
  for (const edge of imported.filter((cell) => cell.kind === 'edge' && cell.source && cell.target)) {
    const sourceRoot = importedRootOf.get(edge.source!)
    const targetRoot = importedRootOf.get(edge.target!)
    const neighbour = sourceRoot === importedRoot.id ? targetRoot : targetRoot === importedRoot.id ? sourceRoot : null
    if (!neighbour) continue
    const existingNeighbour = plan.matches.get(neighbour)
    const importedNeighbour = imported.find((cell) => cell.id === neighbour)
    const existingCell = existingNeighbour ? existingById.get(existingNeighbour) : null
    if (!importedNeighbour?.geometry || !existingCell?.geometry) continue
    offsets.push({ x: existingCell.geometry.x - importedNeighbour.geometry.x, y: existingCell.geometry.y - importedNeighbour.geometry.y })
  }
  if (offsets.length === 0) return null
  return {
    x: Math.round(offsets.reduce((sum, offset) => sum + offset.x, 0) / offsets.length),
    y: Math.round(offsets.reduce((sum, offset) => sum + offset.y, 0) / offsets.length),
  }
}

/**
 * Applies the cells of a fresh import to one page of a proposal draft: existing imported objects are matched by
 * `codrawSource`, then by name, and keep their ids, geometry and visual style.
 */
export function applySchemaUpdate(doc: Y.Doc, pageId: string, imported: CellData[], author: Author | null = null): SchemaUpdateSummary {
  const existing = pageCells(doc, pageId)
  const cells = getCells(doc, pageId)
  const plan = planRoots(existing, imported)
  const summary = summarizeSchemaUpdate(existing, imported)
  const existingById = new Map(existing.map((cell) => [cell.id, cell]))
  const importedById = new Map(imported.map((cell) => [cell.id, cell]))
  const idMap = new Map<string, string>([...plan.matches])
  const deletes = new Set<string>()
  const deletedElements = new Set<string | null>()
  const writes: CellData[] = []
  let lastRootOrder = existing
    .filter((cell) => cell.parent === LAYER_CELL_ID)
    .sort(compareCells)
    .at(-1)?.order ?? null

  const scopedRoots = new Set(plan.scopedExisting)
  const matchedExistingRoots = new Set(plan.matches.values())
  for (const root of scopedRoots) {
    if (matchedExistingRoots.has(root)) continue
    deletes.add(root)
    descendants(existing, root).forEach((cell) => deletes.add(cell.id))
  }

  const scopedCellRoots = rootOf(existing)
  const scopedCells = new Set(
    existing
      .filter((cell) => {
        const root = scopedCellRoots.get(cell.id)
        return root ? scopedRoots.has(root) : false
      })
      .map((cell) => cell.id),
  )

  const reserveId = (id: string) => {
    if (!existingById.has(id) && !idMap.has(id)) return id
    let next = newId()
    while (existingById.has(next) || idMap.has(next)) next = newId()
    return next
  }

  const write = (cell: CellData) => {
    if (deletes.has(cell.id)) deletes.delete(cell.id)
    writes.push(cell)
  }

  const addSubtree = (importedCell: CellData, parent: string | null, offset: { x: number; y: number } | null = null) => {
    const id = reserveId(importedCell.id)
    idMap.set(importedCell.id, id)
    const shifted =
      offset && importedCell.geometry
        ? { ...importedCell.geometry, x: importedCell.geometry.x + offset.x, y: importedCell.geometry.y + offset.y }
        : importedCell.geometry
    const geometry = parent === LAYER_CELL_ID && shifted ? { ...shifted, x: Math.max(40, shifted.x), y: Math.max(40, shifted.y) } : shifted
    const order = parent === LAYER_CELL_ID ? (lastRootOrder = orderBetween(lastRootOrder, null)) : importedCell.order
    write({ ...importedCell, id, parent, order, geometry })
    for (const child of directChildren(imported, importedCell.id)) addSubtree(child, id, null)
  }

  const syncChildren = (importedParent: string, existingParent: string) => {
    const importedChildren = directChildren(imported, importedParent)
    const existingChildren = directChildren(existing, existingParent)
    const childMatches = new Map<string, string>()
    const usedExisting = new Set<string>()
    const existingBySource = singleMap(existingChildren, sourceOf)
    const importedBySource = singleMap(importedChildren, sourceOf)
    for (const [source, importedChild] of importedBySource) {
      const existingChild = existingBySource.get(source)
      if (!existingChild) continue
      childMatches.set(importedChild.id, existingChild.id)
      usedExisting.add(existingChild.id)
    }
    const existingByName = singleMap(
      existingChildren.filter((cell) => !usedExisting.has(cell.id)),
      childKey,
    )
    const importedByName = singleMap(
      importedChildren.filter((cell) => !childMatches.has(cell.id)),
      childKey,
    )
    for (const [key, importedChild] of importedByName) {
      const existingChild = existingByName.get(key)
      if (!existingChild) continue
      childMatches.set(importedChild.id, existingChild.id)
      usedExisting.add(existingChild.id)
    }
    const matchedExisting = new Set(childMatches.values())
    for (const child of existingChildren) {
      if (!matchedExisting.has(child.id)) deletes.add(child.id)
    }
    for (const importedChild of importedChildren) {
      const existingId = childMatches.get(importedChild.id)
      if (existingId) {
        const existingChild = existingById.get(existingId)!
        idMap.set(importedChild.id, existingId)
        write(matchedCell(existingChild, importedChild, existingId, existingParent))
        syncChildren(importedChild.id, existingId)
      } else {
        addSubtree(importedChild, existingParent)
      }
    }
  }

  for (const [importedRootId, existingRootId] of plan.matches) {
    const importedRoot = importedById.get(importedRootId)
    const existingRoot = existingById.get(existingRootId)
    if (!importedRoot || !existingRoot) continue
    // A table stays in its layer.
    write(matchedCell(existingRoot, importedRoot, existingRootId, existingRoot.parent ?? LAYER_CELL_ID))
    syncChildren(importedRootId, existingRootId)
  }

  for (const importedRoot of imported.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex' && !plan.matches.has(cell.id))) {
    const offset = hasGeometry(importedRoot) ? newGeometryOffset(importedRoot, imported, plan, existingById) : null
    addSubtree(importedRoot, LAYER_CELL_ID, offset)
  }

  const existingEdges = existing.filter((cell) => cell.kind === 'edge')
  const importedEdges = imported.filter((cell) => cell.kind === 'edge')
  const edgeInScope = (edge: CellData) => {
    const source = sourceOf(edge)
    if (source && [...importedEdges, ...imported.filter((cell) => cell.kind === 'vertex')].some((cell) => sourceOf(cell)?.startsWith(`${sourcePrefix(source)}:`))) {
      return true
    }
    return (edge.source !== null && scopedCells.has(edge.source)) || (edge.target !== null && scopedCells.has(edge.target))
  }
  const scopedEdges = existingEdges.filter(edgeInScope)
  const existingByEdge = singleMap(scopedEdges, edgeKey)
  const usedEdges = new Set<string>()
  for (const importedEdge of importedEdges) {
    const source = importedEdge.source ? (idMap.get(importedEdge.source) ?? null) : null
    const target = importedEdge.target ? (idMap.get(importedEdge.target) ?? null) : null
    const mapped = { ...importedEdge, source, target }
    const existingEdge = existingByEdge.get(edgeKey(mapped) ?? '')
    if (existingEdge) {
      usedEdges.add(existingEdge.id)
      idMap.set(importedEdge.id, existingEdge.id)
      write(matchedEdge(existingEdge, importedEdge, source, target))
    } else {
      const id = reserveId(importedEdge.id)
      idMap.set(importedEdge.id, id)
      write({ ...importedEdge, id, source, target, order: (lastRootOrder = orderBetween(lastRootOrder, null)) })
    }
  }
  for (const edge of scopedEdges) if (!usedEdges.has(edge.id)) deletes.add(edge.id)
  for (const edge of existingEdges) if ((edge.source && deletes.has(edge.source)) || (edge.target && deletes.has(edge.target))) deletes.add(edge.id)

  doc.transact(() => {
    const at = Date.now()
    for (const id of deletes) {
      const existingCell = existingById.get(id)
      if (existingCell) deletedElements.add(elementIdOf(existingCell.style))
      deleteCell(cells, id)
    }
    for (const cell of writes) {
      const result = writeCell(cells, cell)
      const entry = cells.get(cell.id)
      if (author && entry && isAttributedWrite(result)) writeAttribution(entry, author, at)
    }
    dropUnusedElements(doc, deletedElements)
  }, SCHEMA_IMPORT_UPDATE_ORIGIN)

  return summary
}

const pending = new Map<string, SchemaImportUpdate>()

export function setPendingSchemaImportUpdate(proposalId: string, update: SchemaImportUpdate) {
  pending.set(proposalId, update)
}

export function takePendingSchemaImportUpdate(proposalId: string): SchemaImportUpdate | null {
  const update = pending.get(proposalId) ?? null
  pending.delete(proposalId)
  return update
}
