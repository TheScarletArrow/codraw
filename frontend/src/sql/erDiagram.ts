import { isBaseStyle } from '../diagram/baseTables.ts'
import { compareCells, LAYER_CELL_ID, type CellData, type StyleValue } from '../diagram/model.ts'
import { layoutShapes, type LayoutEngine } from '../diagram/layout.ts'
import { findShape, isTableIndexStyle, isTableStyle, type ShapeStyle } from '../diagram/shapes.ts'
import { SOURCE_KEY } from '../diagram/sources.ts'
import { badgeRoom, tableRows } from '../diagram/tableRows.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import {
  tokenize,
  typeText,
  type SqlColumn,
  type SqlForeignKey,
  type SqlIndex,
  type SqlSchema,
  type SqlTable,
} from './parseSql.ts'
import { vendorOf } from './dbVendors.ts'
import { FIELD_WORDS, plainText, sourceRefers, splitField } from './tableField.ts'
import { indexText, splitIndex } from './tableIndex.ts'

/** A plain identifier needs no quotes: lower case letters, digits and `_`, not starting with a digit. */
const PLAIN = /^[a-z_][a-z0-9_$]*$/

/** Words that PostgreSQL reserves: as names of tables or columns they need quotes. */
const RESERVED = new Set(
  (
    'all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create ' +
    'current_catalog current_date current_role current_time current_timestamp current_user default deferrable desc ' +
    'distinct do else end except false fetch for foreign from grant group having in initially intersect into lateral ' +
    'leading limit localtime localtimestamp not null offset on only or order placing primary references returning ' +
    'select session_user some symmetric system_user table then to trailing true union unique user using variadic when ' +
    'where window with'
  ).split(' '),
)

/** The name as SQL writes it: in double quotes unless it is a plain identifier. */
export function quoteName(name: string): string {
  return PLAIN.test(name) && !RESERVED.has(name) ? name : `"${name.replaceAll('"', '""')}"`
}

/** The text of a field of a table: `name type`, then `PK`, `FK`, `NOT NULL` and `UNIQUE` as they apply. */
export function fieldLabel(column: SqlColumn, foreignKey: boolean): string {
  return [
    quoteName(column.name),
    column.type,
    column.primaryKey && 'PK',
    foreignKey && 'FK',
    !column.primaryKey && column.notNull && 'NOT NULL',
    !column.primaryKey && column.unique && 'UNIQUE',
  ]
    .filter(Boolean)
    .join(' ')
}

/** A column from the text of a field, as {@link fieldLabel} writes it or as people type it: `email text NOT NULL`. */
export function parseFieldLabel(label: string): (SqlColumn & { foreignKey: boolean }) | null {
  const tokens = tokenize(plainText(label))
  const first = tokens[0]
  if (!first || (first.kind !== 'word' && first.kind !== 'identifier')) return null
  const field = { name: first.kind === 'word' ? first.text : first.value, type: '', notNull: false, primaryKey: false, unique: false, foreignKey: false }
  const type: typeof tokens = []
  let typed = true
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]!
    const word = token.kind === 'word' ? token.value : null
    if (word === 'PK' || (word === 'PRIMARY' && tokens[index + 1]?.value === 'KEY')) {
      field.primaryKey = true
      field.notNull = true
    } else if (word === 'FK' || word === 'REFERENCES') {
      field.foreignKey = true
    } else if (word === 'NOT' && tokens[index + 1]?.value === 'NULL') {
      field.notNull = true
      index++
    } else if (word === 'UNIQUE') {
      field.unique = true
    } else if (typed && !(word && FIELD_WORDS.has(word))) {
      type.push(token)
      continue
    }
    typed = false
  }
  field.type = typeText(type) || 'text'
  return field
}

/** Width of text estimated from its length, where the canvas cannot measure it. */
const estimate = (text: string) => text.length * 7.5

/**
 * Width of a table that fits its name beside the badge of its database, the rows of its fields with their references
 * and the rows of its indexes, estimated from the lengths of their texts.
 */
export function tableWidth(name: string, labels: string[], references: (string | null)[] = [], indexes: string[] = []): number {
  const rows = tableRows(
    labels.map((text, index) => ({ text, font: {}, reference: references[index] ?? null })),
    estimate,
    indexes.map((text) => ({ text, font: {}, reference: null })),
  )
  // Tables get the database of the table of the palette.
  const header = estimate(name) + 2 * badgeRoom(vendorOf(findShape('table')!.style)!.badge) + 24
  return Math.min(560, Math.max(160, Math.ceil(Math.max(header, ...rows.map((row) => row.width)))))
}

/** The column alone identifies a row: it is unique, or the only column of the primary key. */
function identifies(table: SqlTable, column: SqlColumn | undefined): boolean {
  if (!column) return false
  return column.unique || (column.primaryKey && table.columns.filter((candidate) => candidate.primaryKey).length === 1)
}

/** Markers of a reference: many rows (or one, for a column that identifies them) refer to one row (or none, nullable). */
function referenceStyle(table: SqlTable, column: SqlColumn | undefined) {
  return {
    startArrow: identifies(table, column) ? 'ERzeroToOne' : 'ERzeroToMany',
    endArrow: column?.notNull ? 'ERmandOne' : 'ERzeroToOne',
  }
}

/** The columns of the referenced table that a foreign key refers to: those it names, or its primary key. */
function referencedColumns(foreignKey: SqlForeignKey, table: SqlTable): string[] {
  if (foreignKey.references.length > 0) return foreignKey.references
  return table.columns.filter((column) => column.primaryKey).map((column) => column.name)
}

/** A relation between two tables whose columns are not known, e.g. of an ER diagram of Mermaid. */
export interface TableLink {
  /** The table that refers to the other. */
  from: string
  to: string
  label: string
  style: Record<string, StyleValue>
}

/**
 * Tables of an ER diagram for the schema, laid out in layers along their references, with the top-left corner at
 * `origin`: a field per column, an edge from each referencing field to the field it refers to, and an edge between the
 * tables of each of `links`.
 */
export async function schemaCells(
  schema: SqlSchema,
  origin: { x: number; y: number },
  engine?: () => Promise<LayoutEngine>,
  links: TableLink[] = [],
  sourcePrefix?: string,
): Promise<CellData[]> {
  const builder = new DiagramBuilder()
  const referencing = (table: SqlTable, column: string) => table.foreignKeys.some((key) => key.columns.includes(column))
  /** The field a column refers to as `table.field`, when the schema has it, so that an edge leads there. */
  const referenceOf = (table: SqlTable, column: string): string | null => {
    for (const key of table.foreignKeys) {
      const target = schema.tables.find((candidate) => candidate.name === key.table)
      const referenced = target && referencedColumns(key, target)[key.columns.indexOf(column)]
      if (referenced && target.columns.some((candidate) => candidate.name === referenced)) return `${target.name}.${referenced}`
    }
    return null
  }
  const built = new Map(
    schema.tables.map((table) => {
      const labels = table.columns.map((column) => fieldLabel(column, referencing(table, column.name)))
      const references = table.columns.map((column) => referenceOf(table, column.name))
      const indexes = table.indexes.map((index) => indexText({ ...index, nameText: quoteName(index.name) }))
      const built = builder.table(table.name, 0, 0, labels, tableWidth(table.name, labels, references, indexes), indexes)
      return [
        table.name,
        {
          id: built.id,
          fields: new Map(table.columns.map((column, index) => [column.name, built.fields[index]!])),
          indexes: new Map(table.indexes.map((index, at) => [index.name, built.indexes[at]!])),
        },
      ]
    }),
  )
  const references: { source: string; target: string }[] = []
  const sourceMarks = new Map<string, string>()
  for (const table of schema.tables) {
    for (const foreignKey of table.foreignKeys) {
      const target = schema.tables.find((candidate) => candidate.name === foreignKey.table)
      if (!target) continue
      const columns = referencedColumns(foreignKey, target)
      foreignKey.columns.forEach((name, index) => {
        const source = built.get(table.name)!.fields.get(name)
        const referenced = columns[index] && built.get(target.name)!.fields.get(columns[index])
        if (!source || !referenced) return
        const edge = builder.edge(source, referenced, { style: referenceStyle(table, table.columns.find((column) => column.name === name)) })
        if (sourcePrefix) {
          const referenceName = columns[index] ?? ''
          sourceMarks.set(edge, `${sourcePrefix}:${table.name}.${name}->${target.name}.${referenceName}`)
        }
        references.push({ source: built.get(table.name)!.id, target: built.get(target.name)!.id })
      })
    }
  }
  for (const link of links) {
    const [from, to] = [built.get(link.from)?.id, built.get(link.to)?.id]
    if (!from || !to) continue
    const edge = builder.edge(from, to, { value: link.label, style: link.style })
    if (sourcePrefix) sourceMarks.set(edge, `${sourcePrefix}:${link.from}->${link.to}:${link.label}`)
    references.push({ source: from, target: to })
  }
  const cells = builder.build()
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  if (sourcePrefix) {
    for (const table of schema.tables) {
      const entry = built.get(table.name)
      if (!entry) continue
      sourceMarks.set(entry.id, `${sourcePrefix}:${table.name}`)
      for (const column of table.columns) {
        const field = entry.fields.get(column.name)
        if (field) sourceMarks.set(field, `${sourcePrefix}:${table.name}.${column.name}`)
      }
      for (const index of table.indexes) {
        const row = entry.indexes.get(index.name)
        if (row) sourceMarks.set(row, `${sourcePrefix}:${table.name}#index:${index.name}`)
      }
    }
    for (const [id, source] of sourceMarks) {
      const cell = byId.get(id)
      if (cell) cell.style = { ...cell.style, [SOURCE_KEY]: source }
    }
  }
  const tables = cells.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex')
  const boxes = await layoutShapes(
    tables.map((cell) => ({ id: cell.id, ...cell.geometry!, frame: false })),
    references.map((reference, index) => ({ id: `reference-${index}`, ...reference })),
    'right',
    engine,
  )
  // The tables were built at (0, 0), which the layout keeps as its top-left corner.
  for (const cell of tables) {
    const box = boxes.get(cell.id)
    if (box) cell.geometry = { ...cell.geometry!, x: box.x + origin.x, y: box.y + origin.y }
  }
  return cells
}

/** Where new cells go: to the right of what the page has, with a gap, or near its corner on an empty page. */
export function placeBeside(existing: CellData[]): { x: number; y: number } {
  const shapes = existing.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex' && cell.geometry)
  if (shapes.length === 0) return { x: 40, y: 40 }
  return {
    x: Math.max(...shapes.map((cell) => cell.geometry!.x + cell.geometry!.width)) + 80,
    y: Math.min(...shapes.map((cell) => cell.geometry!.y)),
  }
}

/** A field of a table of a page, with the id of its cell. */
export interface DiagramField {
  id: string
  column: SqlColumn & { foreignKey: boolean }
  /** The type as written, e.g. `VARCHAR2(255)` or `LowCardinality(String)`; the column has it in lower case. */
  writtenType: string
}

/** An index of a table of a page, with the id of the cell of its row. */
export interface DiagramIndex {
  id: string
  index: SqlIndex
}

/** A reference between fields of two tables of a page: the edge between them, from the field that refers. */
export interface DiagramReference {
  /** The id of the edge. */
  id: string
  /** The id of the field that refers. */
  field: string
  /** The ids of the table and of the field that it refers to. */
  referencedTable: string
  referencedField: string
}

/**
 * A table of a page as {@link diagramSchema} reads it, with the ids of the cells it is read from. `fields`, `indexes`
 * and `references` go along the columns, indexes and foreign keys of `table`.
 */
export interface DiagramTable {
  id: string
  /** The style of the table, e.g. with its database. */
  style: Record<string, StyleValue>
  table: SqlTable
  fields: DiagramField[]
  indexes: DiagramIndex[]
  references: DiagramReference[]
}

/**
 * The tables of a page in the order of `cells`, with the ids of their cells: fields parsed from their text, references
 * from the edges between fields, indexes from the rows of indexes. A base table is a template of fields rather than a
 * table of the database: it is left out with the edges of its fields, and the tables that inherit it have the copies of
 * its fields as their columns.
 */
export function diagramTables(cells: CellData[]): DiagramTable[] {
  const tableCells = cells.filter(
    (cell) => cell.kind === 'vertex' && isTableStyle(cell.style as ShapeStyle) && !isBaseStyle(cell.style),
  )
  const tables: DiagramTable[] = []
  const fieldOf = new Map<string, { table: DiagramTable; field: DiagramField }>()
  for (const tableCell of tableCells) {
    const table: DiagramTable = {
      id: tableCell.id,
      style: tableCell.style,
      table: { name: plainText(tableCell.value) || 'table', columns: [], foreignKeys: [], indexes: [] },
      fields: [],
      indexes: [],
      references: [],
    }
    const rows = cells.filter((cell) => cell.parent === tableCell.id && cell.kind === 'vertex').sort(compareCells)
    for (const row of rows.filter((cell) => isTableIndexStyle(cell.style))) {
      const parts = splitIndex(row.value)
      if (!parts) continue
      const index = { name: parts.name, columns: parts.columns, unique: parts.unique, method: parts.method, rest: parts.rest }
      table.table.indexes.push(index)
      table.indexes.push({ id: row.id, index })
    }
    for (const row of rows.filter((cell) => !isTableIndexStyle(cell.style))) {
      const column = parseFieldLabel(row.value)
      if (!column) continue
      const field = { id: row.id, column, writtenType: splitField(row.value)?.type || column.type }
      table.table.columns.push(column)
      table.fields.push(field)
      fieldOf.set(row.id, { table, field })
    }
    tables.push(table)
  }
  for (const edge of cells.filter((cell) => cell.kind === 'edge' && cell.source && cell.target)) {
    const source = fieldOf.get(edge.source!)
    const target = fieldOf.get(edge.target!)
    if (!source || !target) continue
    const [from, to] = sourceRefers(source.field.column, target.field.column, edge.style) ? [source, target] : [target, source]
    from.table.table.foreignKeys.push({
      name: null,
      columns: [from.field.column.name],
      table: to.table.table.name,
      references: [to.field.column.name],
    })
    from.table.references.push({ id: edge.id, field: from.field.id, referencedTable: to.table.id, referencedField: to.field.id })
  }
  return tables
}

/**
 * The schema of the tables of a page: fields parsed from their text, references from the edges between fields, indexes
 * from the rows of indexes, see {@link diagramTables}.
 */
export function diagramSchema(cells: CellData[]): SqlSchema {
  return { tables: diagramTables(cells).map((entry) => entry.table), skipped: 0 }
}

/**
 * DDL of PostgreSQL that creates the tables, then their indexes, then adds their foreign keys, so that the order of
 * tables never matters.
 */
export function schemaSql(schema: SqlSchema): string {
  const creates = schema.tables.map((table) => {
    const keys = table.columns.filter((column) => column.primaryKey)
    const lines = table.columns.map((column) =>
      [
        quoteName(column.name),
        column.type,
        keys.length === 1 && column.primaryKey && 'PRIMARY KEY',
        !column.primaryKey && column.notNull && 'NOT NULL',
        !column.primaryKey && column.unique && 'UNIQUE',
      ]
        .filter(Boolean)
        .join(' '),
    )
    if (keys.length > 1) lines.push(`PRIMARY KEY (${keys.map((column) => quoteName(column.name)).join(', ')})`)
    return `CREATE TABLE ${quoteName(table.name)} (\n${lines.map((line) => `    ${line}`).join(',\n')}\n);`
  })
  const indexes = schema.tables.flatMap((table) =>
    table.indexes.map(
      (index) =>
        `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteName(index.name)} ON ${quoteName(table.name)}` +
        `${index.method ? ` USING ${index.method}` : ''} (${index.columns})${index.rest ? ` ${index.rest}` : ''};`,
    ),
  )
  const foreignKeys = schema.tables.flatMap((table) =>
    table.foreignKeys.map(
      (key) =>
        `ALTER TABLE ${quoteName(table.name)} ADD FOREIGN KEY (${key.columns.map(quoteName).join(', ')}) ` +
        `REFERENCES ${quoteName(key.table)}${key.references.length > 0 ? ` (${key.references.map(quoteName).join(', ')})` : ''};`,
    ),
  )
  return [...creates, ...[indexes, foreignKeys].filter((lines) => lines.length > 0).map((lines) => lines.join('\n'))].join('\n\n') + '\n'
}

/** A name that Mermaid takes: letters, digits, `_` and `-`. */
const mermaidName = (name: string) => name.replace(/[^\p{L}\p{N}_-]/gu, '_').replace(/^(?=\d)/, '_')

/** A type that Mermaid takes: no spaces or commas. */
const mermaidType = (type: string) => type.replace(/,\s*/g, '_').replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_\-()[\]]/gu, '')

/** An `erDiagram` of Mermaid with the tables, their columns and keys, and their references. */
export function schemaMermaid(schema: SqlSchema): string {
  const lines = ['erDiagram']
  for (const table of schema.tables) {
    lines.push(`    ${mermaidName(table.name)} {`)
    for (const column of table.columns) {
      const keys = [
        column.primaryKey && 'PK',
        table.foreignKeys.some((key) => key.columns.includes(column.name)) && 'FK',
        !column.primaryKey && column.unique && 'UK',
      ].filter(Boolean)
      lines.push(`        ${mermaidType(column.type)} ${mermaidName(column.name)}${keys.length > 0 ? ` ${keys.join(', ')}` : ''}`)
    }
    lines.push('    }')
  }
  for (const table of schema.tables) {
    for (const key of table.foreignKeys) {
      const column = table.columns.find((candidate) => candidate.name === key.columns[0])
      const one = identifies(table, column) ? 'o|' : 'o{'
      const referenced = column?.notNull ? '||' : '|o'
      lines.push(`    ${mermaidName(key.table)} ${referenced}--${one} ${mermaidName(table.name)} : "${key.columns.join(', ')}"`)
    }
  }
  return lines.join('\n') + '\n'
}
