import { typeText, type SqlColumn, type Token } from './parseSql.ts'

/**
 * Reads the query of a view from its tokens, without a parser of SQL: the columns its first `SELECT` gives, with the
 * types that can be told from the tables it reads, and the relations it reads. Enough for what DDL, pg_dump and
 * mysqldump write; a column whose name or type it cannot tell gets `?column?` or no type, as the database would name it.
 */

/** A view's column: its name and type, no keys. */
export type ViewColumn = Pick<SqlColumn, 'name' | 'type'>

/** What the query of a view gives and reads. */
export interface ViewQuery {
  columns: ViewColumn[]
  /** Names of the relations after `FROM` and `JOIN` at any depth, without those of `WITH`, in the order they come. */
  dependencies: string[]
}

/** The columns of a relation of the schema by its name, or `null` when the schema has none of that name. */
export type RelationColumns = (name: string) => ViewColumn[] | null

const isWord = (token: Token | undefined, ...values: string[]) => token?.kind === 'word' && values.includes(token.value)
const isSymbol = (token: Token | undefined, value: string) => token?.kind === 'symbol' && token.value === value
const isName = (token: Token | undefined) => token?.kind === 'word' || token?.kind === 'identifier'
/** A name as the parser keeps it: a word in lower case, a quoted identifier as written. */
const nameOf = (token: Token) => (token.kind === 'word' ? token.text.toLowerCase() : token.value)

/** The index of the parenthesis that closes the one at `open`, or the last token when it is not closed. */
function closing(tokens: Token[], open: number): number {
  let depth = 0
  for (let index = open; index < tokens.length; index++) {
    if (isSymbol(tokens[index], '(')) depth++
    if (isSymbol(tokens[index], ')') && --depth === 0) return index
  }
  return tokens.length - 1
}

/** Words after which a list of the select or of the sources ends, outside parentheses. */
const CLAUSES = new Set([
  'FROM',
  'INTO',
  'WHERE',
  'GROUP',
  'HAVING',
  'WINDOW',
  'QUALIFY',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'FETCH',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'MINUS',
  'FOR',
  'WITH',
  'RETURNING',
])

/** Words that end the list of the select: the clauses but `WITH`, which types have, e.g. `timestamp with time zone`. */
const LIST_ENDS = new Set([...CLAUSES].filter((word) => word !== 'WITH'))

/** Words of a join between sources: `NATURAL LEFT OUTER JOIN`, `CROSS JOIN`, `STRAIGHT_JOIN` of MySQL. */
const JOIN_WORDS = new Set(['NATURAL', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'OUTER', 'JOIN', 'STRAIGHT_JOIN'])

/** Words that are not an alias of a source: what may follow a source. */
const NOT_SOURCE_ALIASES = new Set([...CLAUSES, ...JOIN_WORDS, 'ON', 'USING', 'TABLESAMPLE', 'AS', 'LATERAL'])

/** Words after `SELECT` that are not columns: `DISTINCT` and the modifiers of MySQL. */
const SELECT_MODIFIERS = new Set([
  'ALL',
  'DISTINCT',
  'DISTINCTROW',
  'HIGH_PRIORITY',
  'STRAIGHT_JOIN',
  'SQL_SMALL_RESULT',
  'SQL_BIG_RESULT',
  'SQL_BUFFER_RESULT',
  'SQL_NO_CACHE',
  'SQL_CACHE',
  'SQL_CALC_FOUND_ROWS',
])

/** Words that end an expression rather than alias it: `CASE … END`, `IS NULL`, `INTERVAL '1' DAY`. */
const NOT_ALIASES = new Set([
  'END',
  'NULL',
  'TRUE',
  'FALSE',
  'UNKNOWN',
  'ASC',
  'DESC',
  'YEAR',
  'MONTH',
  'WEEK',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
])

/** Words after which a name is an operand rather than an alias: `x IS y`, `a COLLATE "C"`, `count(*) OVER w`. */
const OPERATORS = new Set([
  'AND',
  'OR',
  'NOT',
  'IS',
  'IN',
  'LIKE',
  'ILIKE',
  'SIMILAR',
  'BETWEEN',
  'ESCAPE',
  'COLLATE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'DISTINCT',
  'OVER',
  'AT',
  'ZONE',
  'TO',
  'INTERVAL',
  'ANY',
  'ALL',
  'SOME',
  'EXISTS',
  'ARRAY',
  'DATE',
  'TIME',
  'TIMESTAMP',
])

/** Types of more than one word: their first word and what may follow it. */
const TYPE_WORDS: Record<string, string[]> = {
  DOUBLE: ['PRECISION'],
  CHARACTER: ['VARYING'],
  CHAR: ['VARYING'],
  NATIONAL: ['CHARACTER', 'CHAR', 'VARYING'],
  BIT: ['VARYING'],
  TIMESTAMP: ['WITH', 'WITHOUT', 'TIME', 'ZONE'],
  TIME: ['WITH', 'WITHOUT', 'TIME', 'ZONE'],
  INTERVAL: ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'TO'],
}

/**
 * Where the type that starts at `from` ends: a name, perhaps qualified, the words of a type of more than one word
 * (`timestamp(3) with time zone`, `character varying(20)`), a group in parentheses and `[]`.
 */
function typeEnd(tokens: Token[], from: number): number {
  let at = from
  if (!isName(tokens[at])) return at
  const first = tokens[at]!.kind === 'word' ? tokens[at]!.value : ''
  at++
  while (isSymbol(tokens[at], '.') && isName(tokens[at + 1])) at += 2
  const more = TYPE_WORDS[first] ?? []
  const group = () => {
    if (isSymbol(tokens[at], '(')) at = closing(tokens, at) + 1
  }
  group()
  while (isWord(tokens[at], ...more)) {
    at++
    group()
  }
  while (isSymbol(tokens[at], '[')) at = isSymbol(tokens[at + 1], ']') ? at + 2 : at + 1
  return at
}

/** Splits tokens at the commas outside parentheses. */
function splitAtCommas(tokens: Token[]): Token[][] {
  const parts: Token[][] = [[]]
  let depth = 0
  for (const token of tokens) {
    if (isSymbol(token, '(')) depth++
    if (isSymbol(token, ')')) depth--
    if (depth === 0 && isSymbol(token, ',')) parts.push([])
    else parts.at(-1)!.push(token)
  }
  return parts.filter((part) => part.length > 0)
}

/** The index of the last `::` outside parentheses, or -1. */
function lastCast(tokens: Token[]): number {
  let depth = 0
  let found = -1
  tokens.forEach((token, index) => {
    if (isSymbol(token, '(')) depth++
    if (isSymbol(token, ')')) depth--
    if (depth === 0 && isSymbol(token, '::')) found = index
  })
  return found
}

/** A source of the select: a relation of the schema or a subquery or a function, under its alias. */
interface Source {
  /** The name of the relation; `null` for a subquery or a function. */
  relation: string | null
  alias: string | null
}

/** Whether tokens in parentheses are a query rather than a join of sources. */
const isQuery = (tokens: Token[]) => isWord(tokens[0], 'SELECT', 'WITH', 'VALUES', 'TABLE') || isSymbol(tokens[0], '(')

/** Reads the qualified name at `at`: its last part and where it ends. */
function qualifiedName(tokens: Token[], at: number): { name: string; end: number } | null {
  if (!isName(tokens[at])) return null
  let end = at
  while (isSymbol(tokens[end + 1], '.') && isName(tokens[end + 2])) end += 2
  return { name: nameOf(tokens[end]!), end: end + 1 }
}

/**
 * The sources of a `FROM` that starts at `from`, up to its end at a clause outside parentheses: relations and subqueries
 * with their aliases, separated by commas and joins, whose conditions are passed over; the sources of a join in
 * parentheses, as `pg_get_viewdef` writes joins, are sources too.
 */
function readSources(tokens: Token[], from: number): Source[] {
  const sources: Source[] = []
  let at = from
  while (at < tokens.length) {
    while (isWord(tokens[at], 'LATERAL', 'ONLY')) at++
    const source: Source = { relation: null, alias: null }
    if (isSymbol(tokens[at], '(')) {
      const close = closing(tokens, at)
      const inner = tokens.slice(at + 1, close)
      if (!isQuery(inner)) sources.push(...readSources(inner, 0))
      at = close + 1
    } else {
      const name = qualifiedName(tokens, at)
      if (!name) break
      at = name.end
      if (isSymbol(tokens[at], '(')) at = closing(tokens, at) + 1
      else source.relation = name.name
      if (isSymbol(tokens[at], '*')) at++
    }
    if (isWord(tokens[at], 'AS') && isName(tokens[at + 1])) {
      source.alias = nameOf(tokens[at + 1]!)
      at += 2
    } else if (isName(tokens[at]) && !(tokens[at]!.kind === 'word' && NOT_SOURCE_ALIASES.has(tokens[at]!.value))) {
      source.alias = nameOf(tokens[at]!)
      at++
    }
    if (source.alias !== null && isSymbol(tokens[at], '(')) at = closing(tokens, at) + 1
    sources.push(source)
    // To the next source: after a comma or a join; the condition of a join is passed over.
    let next = false
    while (at < tokens.length && !next) {
      const token = tokens[at]!
      if (isSymbol(token, '(')) {
        at = closing(tokens, at) + 1
      } else if (isSymbol(token, ',')) {
        at++
        next = true
      } else if (isSymbol(token, ')') || (token.kind === 'word' && CLAUSES.has(token.value))) {
        return sources
      } else if (token.kind === 'word' && JOIN_WORDS.has(token.value)) {
        // `LEFT(…)` is a function; a join ends with `JOIN`.
        let end = at
        while (tokens[end]?.kind === 'word' && JOIN_WORDS.has(tokens[end]!.value) && !isWord(tokens[end], 'JOIN', 'STRAIGHT_JOIN')) end++
        if (isWord(tokens[end], 'JOIN', 'STRAIGHT_JOIN')) {
          at = end + 1
          next = true
        } else {
          at++
        }
      } else {
        at++
      }
    }
  }
  return sources
}

/** Functions whose result has the type of their first argument. */
const SAME_TYPE_FUNCTIONS = new Set(['min', 'max', 'coalesce', 'nullif', 'greatest', 'least', 'abs', 'any_value'])

/** Serial types are integers with a default: a view reads the integer. */
const SERIALS: Record<string, string> = {
  serial: 'integer',
  serial4: 'integer',
  bigserial: 'bigint',
  serial8: 'bigint',
  smallserial: 'smallint',
  serial2: 'smallint',
}

class Columns {
  private readonly sources: Source[]
  private readonly relation: RelationColumns

  constructor(sources: Source[], relation: RelationColumns) {
    this.sources = sources
    this.relation = relation
  }

  /** The columns of the source with this alias, or of the relation of this name; `null` when it is not known. */
  ofSource(name: string): ViewColumn[] | null {
    const source =
      this.sources.find((candidate) => candidate.alias === name) ??
      this.sources.find((candidate) => candidate.alias === null && candidate.relation === name)
    return source?.relation ? this.relation(source.relation) : null
  }

  /** All the columns of the sources whose columns are known, as `*` gives them. */
  all(): ViewColumn[] {
    return this.sources.flatMap((source) => (source.relation ? (this.relation(source.relation) ?? []) : []))
  }

  /** The type of a column that `parts` name, e.g. `o.user_id` or `user_id`; empty when it is not known. */
  typeOf(parts: string[]): string {
    const column = parts.at(-1)!
    const candidates = parts.length > 1 ? (this.ofSource(parts.at(-2)!) ?? []) : this.all()
    const type = candidates.find((candidate) => candidate.name === column)?.type ?? ''
    return SERIALS[type] ?? type
  }
}

/** The parts of a column reference, `a.b.c`; `null` for anything else. */
function columnReference(tokens: Token[]): string[] | null {
  if (tokens.length === 0 || tokens.length % 2 === 0) return null
  const parts: string[] = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (index % 2 === 0) {
      if (!isName(token)) return null
      parts.push(nameOf(token))
    } else if (!isSymbol(token, '.')) {
      return null
    }
  }
  return parts
}

/** `name(…)` or `schema.name(…)` as a whole: the name of the function and its arguments. */
function functionCall(tokens: Token[]): { name: string; args: Token[][] } | null {
  const name = qualifiedName(tokens, 0)
  if (!name || !isSymbol(tokens[name.end], '(') || closing(tokens, name.end) !== tokens.length - 1) return null
  return { name: name.name, args: splitAtCommas(tokens.slice(name.end + 1, -1)) }
}

/** `CAST(expression AS type)` as a whole: the expression and the type. */
function castCall(tokens: Token[]): { expression: Token[]; type: Token[] } | null {
  if (!isWord(tokens[0], 'CAST') || !isSymbol(tokens[1], '(') || closing(tokens, 1) !== tokens.length - 1) return null
  const inner = tokens.slice(2, -1)
  let depth = 0
  for (let index = 0; index < inner.length; index++) {
    if (isSymbol(inner[index], '(')) depth++
    if (isSymbol(inner[index], ')')) depth--
    if (depth === 0 && isWord(inner[index], 'AS')) return { expression: inner.slice(0, index), type: inner.slice(index + 1) }
  }
  return null
}

/** An expression without the parentheses around it as a whole. */
function unwrapped(tokens: Token[]): Token[] {
  let result = tokens
  while (result.length > 2 && isSymbol(result[0], '(') && closing(result, 0) === result.length - 1) result = result.slice(1, -1)
  return result
}

/** The name a database gives a column of this expression: of the column, of the function, or `?column?`. */
function expressionName(tokens: Token[]): string {
  const expression = unwrapped(tokens)
  const cast = lastCast(expression)
  if (cast > 0) return expressionName(expression.slice(0, cast))
  // PostgreSQL names a column of `true` after its type.
  if (isWord(expression[0], 'TRUE', 'FALSE') && expression.length === 1) return 'bool'
  if (isWord(expression[0], 'NULL') && expression.length === 1) return '?column?'
  const reference = columnReference(expression)
  if (reference) return reference.at(-1)!
  const castOf = castCall(expression)
  if (castOf) return expressionName(castOf.expression)
  const call = functionCall(expression)
  if (call) return call.name
  if (isWord(expression[0], 'CASE')) return 'case'
  return '?column?'
}

/** The type of an expression: of the column it is, of a cast, of a literal, of `count`; empty when it is not known. */
function expressionType(tokens: Token[], columns: Columns): string {
  const expression = unwrapped(tokens)
  const cast = lastCast(expression)
  if (cast > 0) return typeText(expression.slice(cast + 1, typeEnd(expression, cast + 1)))
  if (isWord(expression[0], 'TRUE', 'FALSE') && expression.length === 1) return 'boolean'
  const reference = columnReference(expression)
  if (reference) return columns.typeOf(reference)
  const castOf = castCall(expression)
  if (castOf) return typeText(castOf.type.slice(0, typeEnd(castOf.type, 0)))
  const call = functionCall(expression)
  if (call?.name === 'count') return 'bigint'
  if (call && SAME_TYPE_FUNCTIONS.has(call.name) && call.args[0]) return expressionType(call.args[0], columns)
  if (expression.length === 1) {
    const [literal] = expression
    if (literal!.kind === 'string') return 'text'
    if (literal!.kind === 'number') return /^\d+$/.test(literal!.value) ? 'integer' : 'numeric'
  }
  return ''
}

/** The alias of an item of the select and the expression before it; no alias when the item has none. */
function aliased(item: Token[]): { expression: Token[]; alias: string | null } {
  const last = item.at(-1)!
  const before = item.at(-2)
  if (item.length >= 3 && isWord(before, 'AS') && (isName(last) || last.kind === 'string')) {
    return { expression: item.slice(0, -2), alias: last.kind === 'word' ? last.text.toLowerCase() : last.value }
  }
  // An alias without `AS`: a name after the end of an expression, not one that continues it.
  if (item.length < 2 || !isName(last) || (last.kind === 'word' && NOT_ALIASES.has(last.value))) return { expression: item, alias: null }
  const endsTerm =
    isSymbol(before, ')') ||
    isSymbol(before, ']') ||
    before!.kind === 'identifier' ||
    before!.kind === 'number' ||
    before!.kind === 'string' ||
    (before!.kind === 'word' && !OPERATORS.has(before!.value))
  if (!endsTerm) return { expression: item, alias: null }
  // The last word may be part of the type of a cast, e.g. `x::double precision`.
  const cast = lastCast(item)
  if (cast >= 0 && typeEnd(item, cast + 1) >= item.length) return { expression: item, alias: null }
  return { expression: item.slice(0, -1), alias: nameOf(last) }
}

/** The names of the queries of `WITH` and where the query after them starts. */
function skipWith(tokens: Token[], from: number): { names: string[]; at: number } {
  const names: string[] = []
  let at = from
  if (!isWord(tokens[at], 'WITH')) return { names, at }
  at++
  if (isWord(tokens[at], 'RECURSIVE')) at++
  while (isName(tokens[at])) {
    names.push(nameOf(tokens[at]!))
    at++
    if (isSymbol(tokens[at], '(')) at = closing(tokens, at) + 1
    if (!isWord(tokens[at], 'AS')) break
    at++
    if (isWord(tokens[at], 'NOT')) at++
    if (isWord(tokens[at], 'MATERIALIZED')) at++
    if (isSymbol(tokens[at], '(')) at = closing(tokens, at) + 1
    if (!isSymbol(tokens[at], ',')) break
    at++
  }
  return { names, at }
}

/** Names after `FROM` and `JOIN` at any depth, with the lists of relations after a comma. */
function relationNames(tokens: Token[]): string[] {
  const names: string[] = []
  tokens.forEach((token, index) => {
    if (!isWord(token, 'FROM', 'JOIN', 'STRAIGHT_JOIN')) return
    let at = index + 1
    for (;;) {
      while (isWord(tokens[at], 'LATERAL', 'ONLY') || isSymbol(tokens[at], '(')) at++
      if (isWord(tokens[at], 'SELECT', 'WITH', 'VALUES', 'TABLE')) return
      const name = qualifiedName(tokens, at)
      if (!name || isSymbol(tokens[name.end], '(')) return
      names.push(name.name)
      at = name.end
      if (isSymbol(tokens[at], '*')) at++
      if (isWord(tokens[at], 'AS')) at++
      if (isName(tokens[at]) && !(tokens[at]!.kind === 'word' && NOT_SOURCE_ALIASES.has(tokens[at]!.value))) at++
      if (isSymbol(tokens[at], '(')) at = closing(tokens, at) + 1
      if (!isSymbol(tokens[at], ',')) return
      at++
    }
  })
  return names
}

/**
 * The columns that the query of a view gives and the relations it reads: the items of its first `SELECT` after the
 * queries of `WITH`, named by their aliases, the columns they are or the functions they call, typed by the columns of
 * the sources of its `FROM` that `relation` knows, by casts, literals and `count`; `*` and `t.*` are the columns of the
 * sources. `TABLE name` gives the columns of the relation.
 */
export function readViewQuery(tokens: Token[], relation: RelationColumns): ViewQuery {
  const { names: queries, at: start } = skipWith(tokens, 0)
  const dependencies = [...new Set(relationNames(tokens))].filter((name) => !queries.includes(name))
  let at = start
  while (isSymbol(tokens[at], '(')) at++
  if (isWord(tokens[at], 'TABLE')) {
    const name = qualifiedName(tokens, at + 1)
    if (!name) return { columns: [], dependencies }
    const columns = (relation(name.name) ?? []).map(({ name, type }) => ({ name, type: SERIALS[type] ?? type }))
    return { columns, dependencies: [...new Set([name.name, ...dependencies])] }
  }
  if (!isWord(tokens[at], 'SELECT')) return { columns: [], dependencies }
  at++
  while (tokens[at]?.kind === 'word' && SELECT_MODIFIERS.has(tokens[at]!.value)) {
    // `DISTINCT ON (…)` of PostgreSQL.
    const on = isWord(tokens[at], 'DISTINCT') && isWord(tokens[at + 1], 'ON') && isSymbol(tokens[at + 2], '(')
    at = on ? closing(tokens, at + 2) + 1 : at + 1
  }
  if (isWord(tokens[at], 'TOP')) at = isSymbol(tokens[at + 1], '(') ? closing(tokens, at + 1) + 1 : at + 2
  const list: Token[] = []
  let depth = 0
  for (; at < tokens.length; at++) {
    const token = tokens[at]!
    if (depth === 0 && (isSymbol(token, ')') || (token.kind === 'word' && LIST_ENDS.has(token.value)))) break
    if (isSymbol(token, '(')) depth++
    if (isSymbol(token, ')')) depth--
    list.push(token)
  }
  const sources = isWord(tokens[at], 'FROM') ? readSources(tokens, at + 1) : []
  const columns = new Columns(sources, relation)
  const result: ViewColumn[] = []
  for (const item of splitAtCommas(list)) {
    if (item.length === 1 && isSymbol(item[0], '*')) {
      result.push(...columns.all().map(({ name, type }) => ({ name, type: SERIALS[type] ?? type })))
      continue
    }
    if (item.length >= 3 && isSymbol(item.at(-1), '*') && isSymbol(item.at(-2), '.')) {
      const qualifier = item.at(-3)!
      const known = isName(qualifier) ? (columns.ofSource(nameOf(qualifier)) ?? []) : []
      result.push(...known.map(({ name, type }) => ({ name, type: SERIALS[type] ?? type })))
      continue
    }
    const { expression, alias } = aliased(item)
    result.push({ name: alias ?? expressionName(expression), type: expressionType(expression, columns) })
  }
  return { columns: result, dependencies }
}
