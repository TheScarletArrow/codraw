import { Cell, Geometry, type AbstractGraph, type CellStyle } from '@maxgraph/core'
import { plainText, splitField } from '../sql/tableField.ts'
import { isTableIndexStyle, isTableStyle, TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT, type ShapeStyle } from './shapes.ts'

/**
 * Style keys of base tables: a base table is a template of fields that other tables inherit, as a mapped superclass of
 * JPA. draw.io keeps keys it does not know, so files keep them.
 */
export const BASE_KEY = 'codrawBase'
/** The base table that new tables of the page get. */
export const DEFAULT_BASE_KEY = 'codrawBaseDefault'
/** The id of the base table that a table inherits. */
export const BASE_TABLE_KEY = 'codrawBaseTable'
/** The id of the field of a base table that an inherited field copies. */
export const INHERITED_KEY = 'codrawInherited'

const flag = (value: unknown) => value === true || value === 1 || value === '1'

function isTable(cell: Cell | null | undefined): cell is Cell {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)
}

/** The style of a base table; for the cells of a page, e.g. those of an export. */
export function isBaseStyle(style: Record<string, unknown>): boolean {
  return flag(style[BASE_KEY])
}

export function isBaseTable(cell: Cell | null | undefined): boolean {
  return isTable(cell) && isBaseStyle(cell.getStyle() as Record<string, unknown>)
}

export function isDefaultBase(cell: Cell | null | undefined): boolean {
  return isBaseTable(cell) && flag((cell!.getStyle() as Record<string, unknown>)[DEFAULT_BASE_KEY])
}

const stringKey = (cell: Cell, key: string): string | null => {
  const value = (cell.getStyle() as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** The id of the base table that a table inherits, or `null`. */
export function baseTableId(table: Cell): string | null {
  return stringKey(table, BASE_TABLE_KEY)
}

/** The id of the field of a base table that a field copies, or `null` for a field of its own. */
export function inheritedFieldId(cell: Cell | null | undefined): string | null {
  return cell?.isVertex() && isTable(cell.getParent()) ? stringKey(cell, INHERITED_KEY) : null
}

/** Tables of the page by id, those inside groups too. */
export function pageTables(graph: AbstractGraph): Map<string, Cell> {
  return new Map(
    graph
      .getDefaultParent()
      .filterDescendants((cell) => isTable(cell))
      .map((table) => [table.getId()!, table]),
  )
}

/**
 * The base tables a table inherits, from the root one to its own base: the bases while they are base tables of the
 * page, up to one that repeats.
 */
export function baseChain(table: Cell, tables: Map<string, Cell>): Cell[] {
  const chain: Cell[] = []
  let id = baseTableId(table)
  while (id !== null) {
    const base = tables.get(id)
    if (!base || !isBaseTable(base) || base === table || chain.includes(base)) break
    chain.unshift(base)
    id = baseTableId(base)
  }
  return chain
}

/** Base tables that a table may inherit: those of the page but itself and the tables that inherit it. */
export function baseOptions(table: Cell, tables: Map<string, Cell>): Cell[] {
  return [...tables.values()].filter((base) => isBaseTable(base) && base !== table && !baseChain(base, tables).includes(table))
}

/** The default base table of the page, or `null`. */
export function defaultBase(tables: Map<string, Cell>): Cell | null {
  return [...tables.values()].find(isDefaultBase) ?? null
}

/** Fields of a table but the inherited ones; indexes are not fields, and tables do not inherit them. */
const ownFields = (table: Cell) =>
  table
    .getChildren()
    .filter((field) => field.isVertex() && inheritedFieldId(field) === null && !isTableIndexStyle(field.getStyle() as Record<string, unknown>))

/** The name of a field, in lower case as SQL compares names; empty for a field without one. */
const nameOf = (field: Cell) => {
  const text = String(field.getValue() ?? '')
  return (splitField(text)?.name ?? plainText(text)).toLowerCase()
}

/**
 * Fields of the bases of `chain` that `table` inherits, from the root base on: a field of the table or of a nearer base
 * replaces the one with its name.
 */
export function inheritedFields(table: Cell, chain: Cell[]): Cell[] {
  const taken = new Set(ownFields(table).map(nameOf).filter(Boolean))
  const kept: Cell[][] = []
  for (const base of [...chain].reverse()) {
    const fields = ownFields(base).filter((field) => !taken.has(nameOf(field)))
    fields.forEach((field) => nameOf(field) && taken.add(nameOf(field)))
    kept.unshift(fields)
  }
  return kept.flat()
}

const sameStyle = (a: object, b: object) => {
  const entries = (style: object) => JSON.stringify(Object.entries(style).sort(([x], [y]) => x.localeCompare(y)))
  return entries(a) === entries(b)
}

const withKey = (cell: Cell, key: string, value: unknown) => {
  const style = cell.getClonedStyle() as Record<string, unknown>
  if (value === undefined) delete style[key]
  else style[key] = value
  return style as CellStyle
}

/**
 * Brings the inherited fields of the tables of the page in line with their bases, inside the change of the model that
 * is being made: copies of the fields of the bases go first, in the order of the chain, with the text and the style of
 * the field they copy; copies of fields the table no longer inherits are removed with their edges. A table whose base
 * is gone keeps its copies as fields of its own. Returns the tables whose fields changed.
 */
export function syncBaseTables(graph: AbstractGraph): Cell[] {
  const tables = pageTables(graph)
  const chains = new Map([...tables.values()].map((table) => [table, baseChain(table, tables)]))
  // Bases before the tables that inherit them: a base whose own base is gone keeps its copies before they are read.
  const ordered = [...tables.values()].sort((a, b) => chains.get(a)!.length - chains.get(b)!.length)
  return ordered.filter((table) => syncTable(graph, table, chains.get(table)!))
}

function syncTable(graph: AbstractGraph, table: Cell, chain: Cell[]): boolean {
  const model = graph.getDataModel()
  const copies = table.getChildren().filter((field) => inheritedFieldId(field) !== null)
  if (chain.length === 0) {
    if (baseTableId(table) === null && copies.length === 0) return false
    model.batchUpdate(() => {
      if (baseTableId(table) !== null) model.setStyle(table, withKey(table, BASE_TABLE_KEY, undefined))
      copies.forEach((copy) => model.setStyle(copy, withKey(copy, INHERITED_KEY, undefined)))
    })
    return copies.length > 0
  }

  const spare = new Set(copies)
  const pairs = inheritedFields(table, chain).map((field) => {
    const copy = copies.find((candidate) => spare.has(candidate) && inheritedFieldId(candidate) === field.getId())
    if (copy) spare.delete(copy)
    return { field, copy }
  })
  // A copy of a field that left the chain, e.g. when a base in between was removed, stays with its edges by its name.
  for (const pair of pairs) {
    if (pair.copy || !nameOf(pair.field)) continue
    pair.copy = [...spare].find((candidate) => nameOf(candidate) === nameOf(pair.field))
    if (pair.copy) spare.delete(pair.copy)
  }

  let changed = spare.size > 0
  model.batchUpdate(() => {
    if (spare.size > 0) graph.removeCells([...spare], true)
    pairs.forEach(({ field, copy }, index) => {
      const style = { ...field.getStyle(), [INHERITED_KEY]: field.getId() } as CellStyle
      const height = field.getGeometry()?.height ?? TABLE_FIELD_HEIGHT
      if (!copy) {
        const created = new Cell(field.getValue(), new Geometry(0, TABLE_HEADER_HEIGHT, table.getGeometry()!.width, height), style)
        // Two participants who add the same copy at once write one cell.
        created.setId(`${table.getId()}:${field.getId()}`)
        created.setVertex(true)
        model.add(table, created, index)
        changed = true
        return
      }
      if (copy.getValue() !== field.getValue()) {
        model.setValue(copy, field.getValue())
        changed = true
      }
      if (!sameStyle(copy.getStyle(), style)) {
        model.setStyle(copy, style)
        changed = true
      }
      const geometry = copy.getGeometry()
      if (geometry && geometry.height !== height) {
        const resized = geometry.clone()
        resized.height = height
        model.setGeometry(copy, resized)
        changed = true
      }
      if (table.getIndex(copy) !== index) {
        model.add(table, copy, index)
        changed = true
      }
    })
  })
  return changed
}
