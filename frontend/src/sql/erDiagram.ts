import { compareCells, LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { layoutShapes, type LayoutEngine } from '../diagram/layout.ts'
import { isTableStyle, type ShapeStyle } from '../diagram/shapes.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { tokenize, typeText, type SqlColumn, type SqlForeignKey, type SqlSchema, type SqlTable } from './parseSql.ts'

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

/** Words of a field that end its type. */
const FIELD_WORDS = new Set(['PK', 'FK', 'NOT', 'NULL', 'UNIQUE', 'PRIMARY', 'REFERENCES', 'DEFAULT', 'CHECK', 'COLLATE', 'GENERATED'])

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

/** The text of a label without markup. */
function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Width of a table that fits its name and fields, from the length of the longest of them. */
function tableWidth(table: SqlTable, labels: string[]): number {
  const longest = Math.max(table.name.length, ...labels.map((label) => label.length))
  return Math.min(420, Math.max(160, Math.ceil(longest * 7.5) + 24))
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

/**
 * Tables of an ER diagram for the schema, laid out in layers along their references, with the top-left corner at
 * `origin`: a field per column and an edge from each referencing field to the field it refers to.
 */
export async function schemaCells(
  schema: SqlSchema,
  origin: { x: number; y: number },
  engine?: () => Promise<LayoutEngine>,
): Promise<CellData[]> {
  const builder = new DiagramBuilder()
  const referencing = (table: SqlTable, column: string) => table.foreignKeys.some((key) => key.columns.includes(column))
  const built = new Map(
    schema.tables.map((table) => {
      const labels = table.columns.map((column) => fieldLabel(column, referencing(table, column.name)))
      const { id, fields } = builder.table(table.name, 0, 0, labels, tableWidth(table, labels))
      return [table.name, { id, fields: new Map(table.columns.map((column, index) => [column.name, fields[index]!])) }]
    }),
  )
  const references: { source: string; target: string }[] = []
  for (const table of schema.tables) {
    for (const foreignKey of table.foreignKeys) {
      const target = schema.tables.find((candidate) => candidate.name === foreignKey.table)
      if (!target) continue
      const columns = referencedColumns(foreignKey, target)
      foreignKey.columns.forEach((name, index) => {
        const source = built.get(table.name)!.fields.get(name)
        const referenced = columns[index] && built.get(target.name)!.fields.get(columns[index])
        if (!source || !referenced) return
        builder.edge(source, referenced, { style: referenceStyle(table, table.columns.find((column) => column.name === name)) })
        references.push({ source: built.get(table.name)!.id, target: built.get(target.name)!.id })
      })
    }
  }
  const cells = builder.build()
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

/** A reference between fields of two tables of the page. */
interface DiagramReference {
  table: string
  column: string
  referencedTable: string
  referencedColumn: string
}

const ONE_MARKERS = new Set(['ERmandOne', 'ERzeroToOne', 'ERone'])

/** The schema of the tables of a page: fields parsed from their text, references from the edges between fields. */
export function diagramSchema(cells: CellData[]): SqlSchema {
  const tableCells = cells.filter((cell) => cell.kind === 'vertex' && isTableStyle(cell.style as ShapeStyle))
  const tables: SqlTable[] = []
  const columnOf = new Map<string, { table: SqlTable; column: SqlColumn & { foreignKey: boolean } }>()
  for (const tableCell of tableCells) {
    const table: SqlTable = { name: plainText(tableCell.value) || 'table', columns: [], foreignKeys: [] }
    const fields = cells.filter((cell) => cell.parent === tableCell.id && cell.kind === 'vertex').sort(compareCells)
    for (const field of fields) {
      const column = parseFieldLabel(field.value)
      if (!column) continue
      table.columns.push(column)
      columnOf.set(field.id, { table, column })
    }
    tables.push(table)
  }
  for (const edge of cells.filter((cell) => cell.kind === 'edge' && cell.source && cell.target)) {
    const source = columnOf.get(edge.source!)
    const target = columnOf.get(edge.target!)
    if (!source || !target) continue
    const reference = referenceOf(source, target, edge)
    reference.table.foreignKeys.push({ name: null, columns: [reference.column], table: reference.referencedTable, references: [reference.referencedColumn] })
  }
  return { tables, skipped: 0 }
}

type Field = { table: SqlTable; column: SqlColumn & { foreignKey: boolean } }

/**
 * Which end of an edge between fields refers to the other: the field marked FK; else the one that is not the primary key
 * when the other is; else the end without the «one» marker; else the source.
 */
function referenceOf(source: Field, target: Field, edge: CellData): { table: SqlTable } & Omit<DiagramReference, 'table'> {
  let [from, to] = [source, target]
  if (source.column.foreignKey !== target.column.foreignKey) {
    if (target.column.foreignKey) [from, to] = [target, source]
  } else if (source.column.primaryKey !== target.column.primaryKey) {
    if (source.column.primaryKey) [from, to] = [target, source]
  } else if (ONE_MARKERS.has(String(edge.style.startArrow ?? '')) && !ONE_MARKERS.has(String(edge.style.endArrow ?? ''))) {
    ;[from, to] = [target, source]
  }
  return { table: from.table, column: from.column.name, referencedTable: to.table.name, referencedColumn: to.column.name }
}

/** DDL of PostgreSQL that creates the tables, then adds their foreign keys, so that the order of tables never matters. */
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
  const foreignKeys = schema.tables.flatMap((table) =>
    table.foreignKeys.map(
      (key) =>
        `ALTER TABLE ${quoteName(table.name)} ADD FOREIGN KEY (${key.columns.map(quoteName).join(', ')}) ` +
        `REFERENCES ${quoteName(key.table)}${key.references.length > 0 ? ` (${key.references.map(quoteName).join(', ')})` : ''};`,
    ),
  )
  return [...creates, ...(foreignKeys.length > 0 ? [foreignKeys.join('\n')] : [])].join('\n\n') + '\n'
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
