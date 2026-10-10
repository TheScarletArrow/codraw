import { splitField, type FieldParts } from '../sql/tableField.ts'
import { indexColumnNames, splitIndex, type IndexParts } from '../sql/tableIndex.ts'
import type { LabelStyle } from './autoWidth.ts'
import { tableMessages } from './TableTools.messages.ts'

/** Width of a text drawn with a font, in pixels at 100%. */
export type Measure = (text: string, font: LabelStyle) => number

/** A field of a table as the row is laid out from. */
export interface RowField {
  text: string
  font: LabelStyle
  /** The field this one refers to as `table.field`, or `null`. */
  reference: string | null
}

export type FieldIcon = 'key' | 'link' | 'unique' | 'index'

/** A text drawn after the name of a field, with its left edge from the left edge of the field. */
export interface RowColumn {
  text: string
  x: number
}

export interface TableRow {
  /** `null` when the text is not a field, e.g. while a new field is empty, and for an index. */
  parts: FieldParts | null
  /** Icons before the name, from the left. */
  icons: FieldIcon[]
  /** Left edge of the name, after the icons of the field with the most of them, so that the names line up. */
  nameX: number
  /** Right edge of the column of names, where the label of the field ends; `null` without columns. */
  nameEnd: number | null
  /** The type, `NULL` or `NOT NULL`, then the reference and the rest of the field; of an index, its columns, then
   * `UNIQUE`, the method and the rest. */
  columns: RowColumn[]
  /** Width of a field that shows the whole row. */
  width: number
}

/** Left edge of the first icon, the size of an icon and the room it takes with the gap after it. */
export const ICON_X = 8
export const ICON_SIZE = 12
export const ICON_STEP = ICON_SIZE + 3
/** Left edge of the name after `icons` icons; there is room for one even in a table without any. */
export const nameX = (icons: number) => ICON_X + Math.max(1, icons) * ICON_STEP + 3
/** Room after the last column. */
export const ROW_PADDING = 8
/** Room between the columns. */
const GAP = 12

/** Left edge of the badge of the database in the header of a table, and its height. */
export const BADGE_X = 6
export const BADGE_HEIGHT = 16
/** Width of the badge of a database: its short name in bold 9px with room on both sides. */
export const badgeWidth = (badge: string) => Math.ceil(badge.length * 6.5) + 8
/** The badge of a base table, at the right of its header. */
export const BASE_BADGE = tableMessages.baseBadge
/** The badges of a view and of a materialized view, at the right of the header, where a base table has its own. */
export const VIEW_BADGE = 'VIEW'
export const MATERIALIZED_VIEW_BADGE = 'MAT VIEW'
/** Room the badge takes in the header of a table on each side of the centred name. */
export const badgeRoom = (badge: string) => BADGE_X + badgeWidth(badge) + 4

const nullability = (parts: FieldParts) => (parts.notNull ? 'NOT NULL' : 'NULL')

/**
 * A key for a primary key, else a link for a field that refers to another one; then a diamond for a unique field; then
 * a sign of an index for a column of an index of its table.
 */
function iconsOf(field: FieldParts | null, reference: string | null, indexed: Set<string>): FieldIcon[] {
  if (!field) return []
  const key: FieldIcon | null = field.primaryKey ? 'key' : field.foreignKey || reference ? 'link' : null
  return [
    ...(key ? [key] : []),
    ...(field.unique ? (['unique'] as const) : []),
    ...(indexed.has(field.name.toLowerCase()) ? (['index'] as const) : []),
  ]
}

/**
 * Rows of the fields of a table, then of its indexes: the icons, the name, then the type, the nullability and the
 * reference with the rest of a field, each in a column as wide as its longest text among the fields, so that the
 * columns line up. The names of indexes start where those of fields do, and their columns line up among the indexes.
 * The columns of a `view` have no nullability: a view does not keep it.
 */
export function tableRows(fields: RowField[], measure: Measure, indexes: RowField[] = [], { view = false } = {}): TableRow[] {
  const parts = fields.map((field) => splitField(field.text))
  const indexParts = indexes.map((index) => splitIndex(index.text))
  const indexed = new Set(indexParts.flatMap((index) => (index ? indexColumnNames(index.columns) : [])).map((name) => name.toLowerCase()))
  const icons = parts.map((field, index) => iconsOf(field, fields[index]!.reference, indexed))
  const widest = (text: (parts: FieldParts) => string) =>
    Math.max(0, ...parts.map((field, index) => (field ? measure(text(field), fields[index]!.font) : 0)))
  const nameLeft = nameX(Math.max(0, ...icons.map((row) => row.length)))
  const nameEnd = nameLeft + widest((field) => field.name)
  const typeX = nameEnd + GAP
  const typeWidth = widest((field) => field.type)
  const nullX = typeWidth > 0 ? typeX + typeWidth + GAP : typeX
  const extraX = view ? nullX : nullX + widest(nullability) + GAP
  const rows = fields.map(({ text, font, reference }, index): TableRow => {
    const field = parts[index]!
    if (!field) return textRow(text, font, nameLeft, measure)
    const extra = [reference && `→ ${reference}`, field.rest].filter(Boolean).join('  ')
    const columns: RowColumn[] = [
      ...(field.type ? [{ text: field.type, x: typeX }] : []),
      ...(view ? [] : [{ text: nullability(field), x: nullX }]),
      ...(extra ? [{ text: extra, x: extraX }] : []),
    ]
    const last = columns.at(-1)
    return {
      parts: field,
      icons: icons[index]!,
      nameX: nameLeft,
      nameEnd,
      columns,
      // A column of a view without a type shows its name alone.
      width: last ? last.x + measure(last.text, font) + ROW_PADDING : nameLeft + measure(field.name, font) + ROW_PADDING,
    }
  })
  return [...rows, ...indexRows(indexes, indexParts, nameLeft, measure)]
}

/** A row that shows its text as it is, e.g. of a field without a name yet. */
function textRow(text: string, font: RowField['font'], nameLeft: number, measure: Measure): TableRow {
  const width = text.trim() ? nameLeft + measure(text, font) + ROW_PADDING : 0
  return { parts: null, icons: [], nameX: nameLeft, nameEnd: null, columns: [], width }
}

/** What an index shows after its columns: `UNIQUE`, the method and the rest. */
const indexExtra = (index: IndexParts) => [index.unique && 'UNIQUE', index.method && `USING ${index.method}`, index.rest].filter(Boolean).join(' ')

/** Rows of indexes: a diamond for a unique one, else the sign of an index; the name, the columns, then the rest. */
function indexRows(indexes: RowField[], parts: (IndexParts | null)[], nameLeft: number, measure: Measure): TableRow[] {
  const widest = (text: (parts: IndexParts) => string) =>
    Math.max(0, ...parts.map((index, at) => (index ? measure(text(index), indexes[at]!.font) : 0)))
  const nameEnd = nameLeft + widest((index) => index.name)
  const columnsX = nameEnd + GAP
  const extraX = columnsX + widest((index) => `(${index.columns})`) + GAP
  return indexes.map(({ text, font }, at) => {
    const index = parts[at]!
    if (!index) return textRow(text, font, nameLeft, measure)
    const extra = indexExtra(index)
    const columns: RowColumn[] = [{ text: `(${index.columns})`, x: columnsX }, ...(extra ? [{ text: extra, x: extraX }] : [])]
    const last = columns.at(-1)!
    return {
      parts: null,
      icons: [index.unique ? 'unique' : 'index'],
      nameX: nameLeft,
      nameEnd,
      columns,
      width: last.x + measure(last.text, font) + ROW_PADDING,
    }
  })
}
