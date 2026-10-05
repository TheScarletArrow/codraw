import { splitField, type FieldParts } from '../sql/tableField.ts'
import type { LabelStyle } from './autoWidth.ts'

/** Width of a text drawn with a font, in pixels at 100%. */
export type Measure = (text: string, font: LabelStyle) => number

/** A field of a table as the row is laid out from. */
export interface RowField {
  text: string
  font: LabelStyle
  /** The field this one refers to as `table.field`, or `null`. */
  reference: string | null
}

export type FieldIcon = 'key' | 'link' | 'unique'

/** A text drawn after the name of a field, with its left edge from the left edge of the field. */
export interface RowColumn {
  text: string
  x: number
}

export interface TableRow {
  /** `null` when the text is not a field, e.g. while a new field is empty. */
  parts: FieldParts | null
  /** Icons before the name, from the left. */
  icons: FieldIcon[]
  /** Left edge of the name, after the icons of the field with the most of them, so that the names line up. */
  nameX: number
  /** Right edge of the column of names, where the label of the field ends; `null` without columns. */
  nameEnd: number | null
  /** The type, `NULL` or `NOT NULL`, then the reference and the rest of the field. */
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
export const BASE_BADGE = 'БАЗА'
/** Room the badge takes in the header of a table on each side of the centred name. */
export const badgeRoom = (badge: string) => BADGE_X + badgeWidth(badge) + 4

const nullability = (parts: FieldParts) => (parts.notNull ? 'NOT NULL' : 'NULL')

/** A key for a primary key, else a link for a field that refers to another one; then a diamond for a unique field. */
function iconsOf(field: FieldParts | null, reference: string | null): FieldIcon[] {
  if (!field) return []
  const key: FieldIcon | null = field.primaryKey ? 'key' : field.foreignKey || reference ? 'link' : null
  return [...(key ? [key] : []), ...(field.unique ? (['unique'] as const) : [])]
}

/**
 * Rows of the fields of a table: the icons, the name, then the type, the nullability and the reference with the rest,
 * each in a column as wide as its longest text in the table, so that the columns line up.
 */
export function tableRows(fields: RowField[], measure: Measure): TableRow[] {
  const parts = fields.map((field) => splitField(field.text))
  const icons = parts.map((field, index) => iconsOf(field, fields[index]!.reference))
  const widest = (text: (parts: FieldParts) => string) =>
    Math.max(0, ...parts.map((field, index) => (field ? measure(text(field), fields[index]!.font) : 0)))
  const nameLeft = nameX(Math.max(0, ...icons.map((row) => row.length)))
  const nameEnd = nameLeft + widest((field) => field.name)
  const typeX = nameEnd + GAP
  const typeWidth = widest((field) => field.type)
  const nullX = typeWidth > 0 ? typeX + typeWidth + GAP : typeX
  const extraX = nullX + widest(nullability) + GAP
  return fields.map(({ text, font, reference }, index) => {
    const field = parts[index]!
    if (!field) {
      const width = text.trim() ? nameLeft + measure(text, font) + ROW_PADDING : 0
      return { parts: null, icons: [], nameX: nameLeft, nameEnd: null, columns: [], width }
    }
    const extra = [reference && `→ ${reference}`, field.rest].filter(Boolean).join('  ')
    const columns: RowColumn[] = [
      ...(field.type ? [{ text: field.type, x: typeX }] : []),
      { text: nullability(field), x: nullX },
      ...(extra ? [{ text: extra, x: extraX }] : []),
    ]
    const last = columns.at(-1)!
    return {
      parts: field,
      icons: icons[index]!,
      nameX: nameLeft,
      nameEnd,
      columns,
      width: last.x + measure(last.text, font) + ROW_PADDING,
    }
  })
}
