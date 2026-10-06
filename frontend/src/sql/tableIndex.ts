import { tokenize, type Token } from './parseSql.ts'
import { plainText } from './tableField.ts'

/** An index of a table read from the text of its row, e.g. `users_email_key (lower(email)) UNIQUE USING btree`. */
export interface IndexParts {
  /** The name without quotes. */
  name: string
  /** The name as written, in quotes when it has them. */
  nameText: string
  /** What the parentheses hold, as written: columns and expressions, e.g. `org_id, lower(email)`. */
  columns: string
  unique: boolean
  /** The method after `USING` as written, e.g. `gin`; empty without one. */
  method: string
  /** What else the text says, as written, e.g. `WHERE deleted_at IS NULL`. */
  rest: string
}

const isName = (token: Token | undefined) => token?.kind === 'word' || token?.kind === 'identifier'
const isSymbol = (token: Token | undefined, value: string) => token?.kind === 'symbol' && token.value === value

/** Where a token ends in its source: a quoted identifier has its quotes, and a quote inside it is doubled. */
export function tokenEnd(token: Token, source: string): number {
  if (token.kind !== 'identifier') return token.start + token.text.length
  const close = source[token.start]!
  return token.start + token.value.replaceAll(close, close + close).length + 2
}

/** The index of the parenthesis that closes the one at `open`, or the last token when it is not closed. */
function closing(tokens: Token[], open: number): number {
  let depth = 0
  for (let index = open; index < tokens.length; index++) {
    if (isSymbol(tokens[index], '(')) depth++
    if (isSymbol(tokens[index], ')') && --depth === 0) return index
  }
  return tokens.length - 1
}

/** The source of the tokens from `from` up to `to`, without it. */
const sliceOf = (source: string, tokens: Token[], from: number, to: number) =>
  from >= to ? '' : source.slice(tokens[from]!.start, tokenEnd(tokens[to - 1]!, source)).trim()

/**
 * The parts of the text of an index: the name, `UNIQUE` and `USING method` wherever they stand outside parentheses,
 * the first group in parentheses as the columns, and the rest. `null` when the text does not start with a name or has
 * no columns.
 */
export function splitIndex(text: string): IndexParts | null {
  const source = plainText(text)
  const tokens = tokenize(source)
  const first = tokens[0]
  if (!isName(first)) return null
  const index: IndexParts = {
    name: first!.kind === 'word' ? first!.text : first!.value,
    nameText: sliceOf(source, tokens, 0, 1),
    columns: '',
    unique: false,
    method: '',
    rest: '',
  }
  let columns = false
  const rest: string[] = []
  let restStart: number | null = null
  const endRest = (at: number) => {
    if (restStart !== null) rest.push(sliceOf(source, tokens, restStart, at))
    restStart = null
  }
  for (let at = 1; at < tokens.length; at++) {
    const token = tokens[at]!
    const word = token.kind === 'word' ? token.value : null
    if (word === 'UNIQUE') {
      endRest(at)
      index.unique = true
    } else if (word === 'USING' && isName(tokens[at + 1])) {
      endRest(at)
      index.method = sliceOf(source, tokens, at + 1, at + 2)
      at++
    } else if (isSymbol(token, '(') && !columns) {
      endRest(at)
      const close = closing(tokens, at)
      index.columns = sliceOf(source, tokens, at + 1, close)
      columns = true
      at = close
    } else {
      restStart ??= at
      // A group of the rest, e.g. `INCLUDE (a)`, stays in the rest whole.
      if (isSymbol(token, '(')) at = closing(tokens, at)
    }
  }
  endRest(tokens.length)
  if (!columns) return null
  index.rest = rest.join(' ')
  return index
}

/** The text of an index: the name, the columns in parentheses, `UNIQUE`, `USING method` and the rest. */
export function indexText(index: IndexParts): string {
  return [index.nameText, `(${index.columns})`, index.unique && 'UNIQUE', index.method && `USING ${index.method}`, index.rest]
    .filter(Boolean)
    .join(' ')
}

/**
 * The text of an index after its name was edited: a name alone replaces the name and keeps the rest of the index; more
 * than a name, e.g. `users_org_idx (org_id) WHERE active`, becomes the whole index. Nothing typed keeps the index.
 */
export function renameIndex(text: string, entered: string): string {
  const tokens = tokenize(plainText(entered))
  if (tokens.length === 0) return text
  const index = splitIndex(text)
  if (tokens.length > 1 || !isName(tokens[0]) || !index) return entered.trim()
  const nameText = plainText(entered)
  return nameText === index.nameText ? text : indexText({ ...index, name: tokens[0]!.kind === 'word' ? tokens[0]!.text : tokens[0]!.value, nameText })
}

/** The elements of the columns of an index, as written, at the commas outside parentheses. */
function elements(columns: string): { text: string; tokens: Token[] }[] {
  const tokens = tokenize(columns)
  const result: { text: string; tokens: Token[] }[] = []
  let from = 0
  let depth = 0
  tokens.forEach((token, at) => {
    if (isSymbol(token, '(')) depth++
    if (isSymbol(token, ')')) depth--
    if (depth === 0 && isSymbol(token, ',')) {
      result.push({ text: sliceOf(columns, tokens, from, at), tokens: tokens.slice(from, at) })
      from = at + 1
    }
  })
  result.push({ text: sliceOf(columns, tokens, from, tokens.length), tokens: tokens.slice(from) })
  return result.filter((element) => element.tokens.length > 0)
}

/** The name of a column that an element is, e.g. `created_at DESC NULLS LAST`; `null` for an expression. */
function columnOf(tokens: Token[]): string | null {
  const first = tokens[0]
  if (!isName(first) || tokens.some((token) => isSymbol(token, '(') || isSymbol(token, '.'))) return null
  return first!.kind === 'word' ? first!.text : first!.value
}

/** Names of the columns of an index, as written: its elements that are columns, not expressions. */
export function indexColumnNames(columns: string): string[] {
  return elements(columns).flatMap(({ tokens }) => columnOf(tokens) ?? [])
}

/** The columns of an index with the column `from` (in any case) written as `to`; expressions stay as they are. */
export function renameIndexColumn(columns: string, from: string, to: string): string {
  const parts = elements(columns)
  if (!parts.some(({ tokens }) => columnOf(tokens)?.toLowerCase() === from.toLowerCase())) return columns
  return parts
    .map(({ text, tokens }) => {
      if (columnOf(tokens)?.toLowerCase() !== from.toLowerCase()) return text
      // The text of an element starts with its name.
      const name = tokens[0]!
      return to + text.slice(tokenEnd(name, columns) - name.start)
    })
    .join(', ')
}

/** A name as SQL writes it in an index: plain identifiers as they are, others in double quotes. */
export function writtenName(name: string): string {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`
}

/**
 * The name PostgreSQL gives an index without one: the table, its columns (`expr` for an expression) and `idx`, or
 * `key` for a unique constraint.
 */
export function defaultIndexName(table: string, columns: string, suffix: 'idx' | 'key'): string {
  const names = elements(columns).map(({ tokens }) => columnOf(tokens) ?? 'expr')
  return [table, ...names, suffix].join('_')
}
