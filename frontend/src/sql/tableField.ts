import { tokenize } from './parseSql.ts'

/** A field of a table read from its text, e.g. `owner_id uuid FK NOT NULL DEFAULT gen_random_uuid()`. */
export interface FieldParts {
  /** The name without quotes. */
  name: string
  /** The name as written, in quotes when it has them, e.g. `"Full Name"`. */
  nameText: string
  /** The type as written, e.g. `VARCHAR2(255)`; empty when the text has none. */
  type: string
  primaryKey: boolean
  /** The text marks the field as a foreign key: `FK` or `REFERENCES …`. */
  foreignKey: boolean
  notNull: boolean
  unique: boolean
  /** What else the text says, as written, e.g. `DEFAULT now()`. */
  rest: string
}

/** Words of a field that end its type. */
export const FIELD_WORDS = new Set([
  'PK',
  'FK',
  'NOT',
  'NULL',
  'UNIQUE',
  'PRIMARY',
  'REFERENCES',
  'DEFAULT',
  'CHECK',
  'COLLATE',
  'GENERATED',
])

/** The text of a label without markup. */
export function plainText(value: string): string {
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

/**
 * The parts of the text of a field: the name, the type up to the first of {@link FIELD_WORDS}, the keys `PK`,
 * `PRIMARY KEY`, `FK`, `NOT NULL`, `UNIQUE` and a bare `NULL` wherever they stand outside parentheses, and the rest.
 * `null` when the text does not start with a name.
 */
export function splitField(text: string): FieldParts | null {
  const source = plainText(text)
  const tokens = tokenize(source)
  const first = tokens[0]
  if (!first || (first.kind !== 'word' && first.kind !== 'identifier')) return null
  const slice = (from: number, to: number) => source.slice(tokens[from]!.start, tokens[to]?.start ?? source.length).trim()
  const isFieldWord = (index: number) => tokens[index]?.kind === 'word' && FIELD_WORDS.has(tokens[index].value)
  let typeEnd = 1
  while (typeEnd < tokens.length && !isFieldWord(typeEnd)) typeEnd++
  const field: FieldParts = {
    name: first.kind === 'word' ? first.text : first.value,
    nameText: slice(0, 1),
    type: typeEnd > 1 ? slice(1, typeEnd) : '',
    primaryKey: false,
    foreignKey: false,
    notNull: false,
    unique: false,
    rest: '',
  }
  const rest: string[] = []
  let restStart: number | null = null
  let depth = 0
  for (let index = typeEnd; index < tokens.length; index++) {
    const token = tokens[index]!
    const word = depth === 0 && token.kind === 'word' ? token.value : null
    const next = tokens[index + 1]?.value
    let length = 0
    if (word === 'PK') {
      field.primaryKey = true
      length = 1
    } else if (word === 'PRIMARY' && next === 'KEY') {
      field.primaryKey = true
      length = 2
    } else if (word === 'FK') {
      field.foreignKey = true
      length = 1
    } else if (word === 'NOT' && next === 'NULL') {
      field.notNull = true
      length = 2
    } else if (word === 'UNIQUE') {
      field.unique = true
      length = 1
    } else if (word === 'NULL' && restStart === null) {
      // A bare `NULL` says the field may be empty; `DEFAULT NULL` or `SET NULL` belong to the rest.
      length = 1
    }
    if (length === 0) {
      if (word === 'REFERENCES') field.foreignKey = true
      if (token.value === '(') depth++
      if (token.value === ')') depth = Math.max(0, depth - 1)
      restStart ??= index
      continue
    }
    if (restStart !== null) rest.push(slice(restStart, index))
    restStart = null
    index += length - 1
  }
  if (restStart !== null) rest.push(slice(restStart, tokens.length))
  field.rest = rest.join(' ')
  if (field.primaryKey) field.notNull = true
  return field
}

/**
 * The text of a field: name, type, `PK`, `FK`, `NOT NULL` (implied by `PK`), `UNIQUE` and the rest. `FK` is not written
 * when the rest has `REFERENCES`, which says it already.
 */
export function fieldText(field: FieldParts): string {
  const references = /\bREFERENCES\b/i.test(field.rest)
  return [
    field.nameText,
    field.type,
    field.primaryKey && 'PK',
    field.foreignKey && !references && 'FK',
    !field.primaryKey && field.notNull && 'NOT NULL',
    field.unique && 'UNIQUE',
    field.rest,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The text of a field after its name was edited: a name alone replaces the name and keeps the rest of the field; more
 * than a name, e.g. `email text NOT NULL`, becomes the whole field. Nothing typed keeps the field as it was.
 */
export function renameField(text: string, entered: string): string {
  const typed = splitField(entered)
  if (!typed) return text
  const field = splitField(text)
  const whole = typed.type || typed.rest || typed.primaryKey || typed.foreignKey || typed.notNull || typed.unique
  if (whole || !field) return entered.trim()
  if (typed.nameText === field.nameText) return text
  return fieldText({ ...field, name: typed.name, nameText: typed.nameText })
}

/** Markers of the end of an edge at a table of which one row is meant. */
const ONE_MARKERS = new Set(['ERmandOne', 'ERzeroToOne', 'ERone'])

/** Keys of a field that tell which end of an edge between fields refers to the other. */
export interface FieldKeys {
  foreignKey: boolean
  primaryKey: boolean
}

/**
 * Whether the source of an edge between fields refers to its target, not the target to the source: the field marked FK
 * refers; else the one that is not the primary key when the other is; else the end without the «one» marker; else the
 * source.
 */
export function sourceRefers(source: FieldKeys, target: FieldKeys, style: Record<string, unknown>): boolean {
  if (source.foreignKey !== target.foreignKey) return source.foreignKey
  if (source.primaryKey !== target.primaryKey) return target.primaryKey
  return !(ONE_MARKERS.has(String(style.startArrow ?? '')) && !ONE_MARKERS.has(String(style.endArrow ?? '')))
}
