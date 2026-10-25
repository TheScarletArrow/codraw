import { newId } from '../diagram/ids.ts'
import { LINK_KEY } from '../diagram/links.ts'
import type { StyleValue } from '../diagram/model.ts'
import {
  findShape,
  markedStyle,
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_STYLE,
  TABLE_HEADER_HEIGHT,
  TABLE_INDEX_GAP,
  TABLE_INDEX_KEY,
} from '../diagram/shapes.ts'
import { commentRoomOf, normalizeTableComment, TABLE_COMMENT_KEY } from '../diagram/tableComments.ts'
import { DEFAULT_FONT_SIZE } from '../diagram/textMeasure.ts'
import { fieldText, splitField, type FieldParts } from '../sql/tableField.ts'
import { indexText } from '../sql/tableIndex.ts'
import type { DrawioCell } from './parse.ts'

/**
 * A table of draw.io — `shape=table` whose rows `shape=tableRow` hold cells side by side, as its ER shapes and the
 * tables of ER diagrams drawn for it have — becomes a table of CoDraw: its name and the line of its comment from the
 * lines of its label, a field per row with the keys of the column of markers (`PK`, `FK`, `UQ`, `IDX`…), the name, the
 * type and its note after `·`, and the rows of the indexes that the markers of indexes and of numbered unique keys
 * (`UQ¹`) describe. The table and its rows keep their ids, so that edges between rows connect the fields; an edge
 * to a cell of a row connects its field. A table with anything but rows of cells stays as draw.io drew it.
 */

/** Keys of a field that the column of markers names. */
type Marker = 'primary' | 'foreign' | 'unique' | 'index' | 'notNull'

const MARKERS: Record<string, Marker> = {
  PK: 'primary',
  FK: 'foreign',
  UQ: 'unique',
  UK: 'unique',
  AK: 'unique',
  U: 'unique',
  IDX: 'index',
  IX: 'index',
  I: 'index',
  NN: 'notNull',
}

/** A marker as the column of markers writes it, e.g. `PK`, `UQ¹`, `REF*`: a short word of capitals, then signs. */
const MARKER = /^([A-Z]{1,6})([*†‡¹²³⁴⁵⁶⁷⁸⁹⁰0-9]*)$/

/** What draw.io draws a table with that CoDraw keeps: its look and what CoDraw added from the file. */
const LOOK_KEYS = new Set(['fillColor', 'strokeColor', 'fontColor', 'fontFamily', 'strokeWidth', 'dashed', 'shadow', 'opacity'])

/** What a field keeps of the cell of its name. */
const FIELD_LOOK_KEYS = new Set(['fontColor', 'fontFamily'])

/** A name that a field writes without quotes: letters of any alphabet, digits and `_`, not starting with a digit. */
const BARE_NAME = /^[\p{L}_][\p{L}\p{N}_$]*$/u

/** Separators of a type and its note in a cell, e.g. `varchar(15) · ОГРН`. */
const NOTE = /\s+[·—]\s+|\s+--\s+/

interface Row {
  cell: DrawioCell
  /** The cells of the row from the left. */
  parts: DrawioCell[]
}

interface Table {
  cell: DrawioCell
  rows: Row[]
}

const isVertex = (cell: DrawioCell) => cell.kind === 'vertex'
const text = (cell: DrawioCell | undefined) => (cell?.value ?? '').replace(/\s+/g, ' ').trim()

/** The words of a cell of the column of markers, e.g. `PK, FK` → `PK`, `FK`; `null` when it is not one. */
function markerWords(value: string): RegExpExecArray[] | null {
  if (!value) return []
  const words = value.split(/[\s,/+]+/).filter(Boolean).map((word) => MARKER.exec(word))
  return words.every((word) => word !== null) ? (words as RegExpExecArray[]) : null
}

/**
 * The first column holds markers when every row has a marker or nothing there, at least one of them is a key CoDraw
 * knows, and the rows have more cells after it.
 */
function hasMarkers(rows: Row[]): boolean {
  let known = false
  for (const { parts } of rows) {
    const words = markerWords(text(parts[0]))
    if (words === null) return false
    if (words.length > 0 && parts.slice(1).every((part) => !text(part))) return false
    if (words.some((word) => MARKERS[word[1]!])) known = true
  }
  return known
}

/** The tables of draw.io among `cells`, each with its rows of cells, when it has nothing else. */
function drawioTables(cells: DrawioCell[]): Table[] {
  const children = new Map<string, DrawioCell[]>()
  for (const cell of cells) if (cell.parent !== null) children.set(cell.parent, [...(children.get(cell.parent) ?? []), cell])
  const left = (a: DrawioCell, b: DrawioCell) => (a.geometry?.x ?? 0) - (b.geometry?.x ?? 0)
  const tables: Table[] = []
  for (const cell of cells) {
    if (!isVertex(cell) || cell.style.shape !== 'table') continue
    const rows = children.get(cell.id) ?? []
    if (rows.length === 0 || !rows.every((row) => isVertex(row) && row.style.shape === 'tableRow')) continue
    const read = rows.map((row) => ({ cell: row, parts: [...(children.get(row.id) ?? [])].sort(left) }))
    const plain = read.every(({ parts }) => parts.every((part) => isVertex(part) && !children.has(part.id)))
    if (plain) tables.push({ cell, rows: read })
  }
  return tables
}

/** The name as a field writes it: in double quotes unless it is a bare name. */
const nameText = (name: string) => (BARE_NAME.test(name) ? name : `"${name.replaceAll('"', '""')}"`)

/** A field read from the cells of a row after its marker, and the markers that CoDraw does not know. */
function fieldOf(cells: string[], markers: RegExpExecArray[]): { field: FieldParts; notes: string[] } | null {
  const [name, type, ...more] = cells.filter(Boolean)
  if (name === undefined) return null
  const notes: string[] = []
  let source = name
  if (type !== undefined) {
    const [typeText, ...note] = type.split(NOTE)
    source = `${nameText(name)} ${typeText}`
    notes.push(...note)
  }
  notes.push(...more)
  const field = splitField(source) ?? splitField(nameText(source))
  if (!field) return null
  const unknown: string[] = []
  for (const marker of markers) {
    const key = MARKERS[marker[1]!]
    // A numbered unique key or index is one of several columns: it is an index of the table, not a key of the field.
    if (key === 'primary') field.primaryKey = field.notNull = true
    else if (key === 'foreign') field.foreignKey = true
    else if (key === 'notNull') field.notNull = true
    else if (key === 'unique' && !marker[2]) field.unique = true
    else if (key !== 'unique' && key !== 'index') unknown.push(marker[0])
  }
  return { field, notes: [...unknown, ...notes] }
}

/** The rest of a field with its notes as the comment of the column, e.g. `COMMENT 'ФИО для ИП'`. */
function withComment(field: FieldParts, notes: string[]): FieldParts {
  const comment = notes.join(' · ').trim()
  if (!comment) return field
  return { ...field, rest: [field.rest, `COMMENT '${comment.replaceAll("'", "''")}'`].filter(Boolean).join(' ') }
}

/** The style of a table of CoDraw for a table of draw.io: that of the palette with the look of the file. */
function tableStyle(style: Record<string, StyleValue>, rowFill: StyleValue | undefined, comment: string): Record<string, StyleValue> {
  const kept: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(style)) {
    if (LOOK_KEYS.has(key) || key === LINK_KEY || key.startsWith('codraw')) kept[key] = value
  }
  return {
    ...(markedStyle(findShape('table')!) as Record<string, StyleValue>),
    ...kept,
    ...(rowFill !== undefined && { swimlaneFillColor: rowFill }),
    ...(comment && { [TABLE_COMMENT_KEY]: comment }),
  }
}

/** The look of a field from the cell of its name. */
function fieldStyle(name: DrawioCell | undefined): Record<string, StyleValue> {
  const style: Record<string, StyleValue> = { ...(TABLE_FIELD_STYLE as Record<string, StyleValue>) }
  for (const [key, value] of Object.entries(name?.style ?? {})) if (FIELD_LOOK_KEYS.has(key)) style[key] = value
  return style
}

/** The cells of a table of CoDraw for `table`: the table, its fields with the ids of the rows, then its indexes. */
function convert({ cell, rows }: Table): DrawioCell[] {
  const [name = '', ...lines] = (cell.value ?? '').split('\n').map((line) => line.replace(/\s+/g, ' ').trim())
  const comment = normalizeTableComment(lines.join(' '))
  // The rows of the file paint the body of the table under the header; the fields of CoDraw lie on it.
  const style = tableStyle(cell.style, rows[0]!.cell.style.fillColor, comment)
  const width = cell.geometry?.width || 220
  const header = TABLE_HEADER_HEIGHT + commentRoomOf(style, DEFAULT_FONT_SIZE)
  const markers = hasMarkers(rows)

  const fields: DrawioCell[] = []
  // Columns of indexes and numbered unique keys by their marker, e.g. `UQ¹`, in the order of the rows.
  const indexes = new Map<string, { unique: boolean; columns: string[] }>()
  for (const row of rows) {
    const texts = row.parts.map(text)
    const words = markers ? markerWords(texts[0]!)! : []
    const read = fieldOf(markers ? texts.slice(1) : texts, words)
    const value = read ? fieldText(withComment(read.field, read.notes)) : texts.filter(Boolean).join(' ')
    const nameCell = row.parts[markers ? 1 : 0]
    fields.push({
      ...row.cell,
      value,
      geometry: { x: 0, y: header + fields.length * TABLE_FIELD_HEIGHT, width, height: TABLE_FIELD_HEIGHT },
      style: fieldStyle(nameCell),
    })
    if (!read) continue
    for (const word of words) {
      const key = MARKERS[word[1]!]
      const single = key === 'index' && !word[2]
      if (key !== 'index' && !(key === 'unique' && word[2])) continue
      const group = single ? `${word[0]}:${read.field.name}` : word[0]
      const index = indexes.get(group) ?? { unique: key === 'unique', columns: [] }
      index.columns.push(read.field.nameText)
      indexes.set(group, index)
    }
  }

  const tableName = name.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'table'
  const indexesTop = header + fields.length * TABLE_FIELD_HEIGHT + TABLE_INDEX_GAP
  const indexCells = [...indexes.values()].map(({ unique, columns }, at): DrawioCell => {
    const names = columns.map((column) => column.replace(/^"|"$/g, '').replace(/[^\p{L}\p{N}_]+/gu, '_').toLowerCase())
    const indexName = `${tableName}_${names.join('_')}_${unique ? 'key' : 'idx'}`
    return {
      id: newId(),
      kind: 'vertex',
      parent: cell.id,
      order: '',
      value: indexText({ name: indexName, nameText: nameText(indexName), columns: columns.join(', '), unique, method: '', rest: '' }),
      geometry: { x: 0, y: indexesTop + at * TABLE_FIELD_HEIGHT, width, height: TABLE_FIELD_HEIGHT },
      source: null,
      target: null,
      style: { ...(TABLE_FIELD_STYLE as Record<string, StyleValue>), [TABLE_INDEX_KEY]: true },
    }
  })
  const height = indexCells.length > 0 ? indexesTop + indexCells.length * TABLE_FIELD_HEIGHT : header + fields.length * TABLE_FIELD_HEIGHT
  const table: DrawioCell = {
    ...cell,
    value: name,
    geometry: { x: cell.geometry?.x ?? 0, y: cell.geometry?.y ?? 0, width, height },
    style,
  }
  return [table, ...fields, ...indexCells]
}

/** The cells with the tables of draw.io as tables of CoDraw; see the top of this file. */
export function withTables(cells: DrawioCell[]): DrawioCell[] {
  const tables = drawioTables(cells)
  if (tables.length === 0) return cells
  const converted = new Map<string, DrawioCell[]>()
  // A cell of a row leads to its field: edges to it connect the field.
  const rowOf = new Map<string, string>()
  const replaced = new Set<string>()
  for (const table of tables) {
    converted.set(table.cell.id, convert(table))
    replaced.add(table.cell.id)
    for (const row of table.rows) {
      replaced.add(row.cell.id)
      for (const part of row.parts) rowOf.set(part.id, row.cell.id)
    }
  }
  const result: DrawioCell[] = []
  for (const cell of cells) {
    if (converted.has(cell.id)) result.push(...converted.get(cell.id)!)
    if (replaced.has(cell.id) || rowOf.has(cell.id)) continue
    if (cell.kind !== 'edge') {
      result.push(cell)
      continue
    }
    const source = cell.source !== null ? (rowOf.get(cell.source) ?? cell.source) : null
    const target = cell.target !== null ? (rowOf.get(cell.target) ?? cell.target) : null
    // The fields are lower than the rows were: the bends of the file would lead past them, so the edge is routed anew.
    const moved = [source, target].some((end) => end !== null && replaced.has(end))
    if (!moved || !cell.geometry?.points) {
      result.push(source === cell.source && target === cell.target ? cell : { ...cell, source, target })
      continue
    }
    const { points: _points, ...geometry } = cell.geometry
    result.push({ ...cell, source, target, geometry })
  }
  return result
}
