import { defaultIndexName, indexColumnNames, renameIndexColumn, tokenEnd, writtenName } from './tableIndex.ts'

/** A column of a table, as DDL declares it. */
export interface SqlColumn {
  name: string
  /** The type as written, in lower case, e.g. `varchar(255)` or `timestamp with time zone`. */
  type: string
  notNull: boolean
  primaryKey: boolean
  unique: boolean
}

/** Columns of a table that refer to columns of another table. */
export interface SqlForeignKey {
  /** The name of the constraint, when DDL gives one, so that `DROP CONSTRAINT` finds it. */
  name: string | null
  columns: string[]
  table: string
  /** Columns of the referenced table; empty for its primary key. */
  references: string[]
}

/** An index of a table; the columns and the rest as DDL writes them. */
export interface SqlIndex {
  name: string
  /** What the parentheses hold, e.g. `org_id, lower(email)`. */
  columns: string
  unique: boolean
  /** The method after `USING`, e.g. `gin`; empty without one. */
  method: string
  /** What follows the columns, e.g. `WHERE deleted_at IS NULL`. */
  rest: string
}

export interface SqlTable {
  name: string
  columns: SqlColumn[]
  foreignKeys: SqlForeignKey[]
  /** Indexes but those of the primary key and of unique columns, which their columns show. */
  indexes: SqlIndex[]
}

/** Tables of a database, in the order DDL creates them. */
export interface SqlSchema {
  tables: SqlTable[]
  /** Statements that change no table, e.g. `CREATE VIEW` or `INSERT`, and those not understood. */
  skipped: number
}

type TokenKind = 'word' | 'identifier' | 'string' | 'number' | 'symbol'

export interface Token {
  kind: TokenKind
  /** A word in upper case; an identifier, a string or a number as written; a symbol itself. */
  value: string
  /** A word as written. */
  text: string
  /** Where the token starts in the source. */
  start: number
}

const WORD = /[A-Za-z_\u0080-￿][\w$\u0080-￿]*/y
const NUMBER = /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const DOLLAR_TAG = /\$([A-Za-z_]\w*)?\$/y

/** Splits DDL into tokens without comments; quoted identifiers keep their case, words are compared in upper case. */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  const match = (pattern: RegExp) => {
    pattern.lastIndex = at
    return pattern.exec(sql)
  }
  while (at < sql.length) {
    const char = sql[at]!
    if (/\s/.test(char)) {
      at++
    } else if (sql.startsWith('--', at)) {
      const end = sql.indexOf('\n', at)
      at = end === -1 ? sql.length : end + 1
    } else if (sql.startsWith('/*', at)) {
      const end = sql.indexOf('*/', at + 2)
      at = end === -1 ? sql.length : end + 2
    } else if (char === "'") {
      let end = at + 1
      // '' inside a string is a quote.
      while (end < sql.length && !(sql[end] === "'" && sql[end + 1] !== "'")) end += sql[end] === "'" ? 2 : 1
      tokens.push({ kind: 'string', value: sql.slice(at + 1, end).replaceAll("''", "'"), text: sql.slice(at, end + 1), start: at })
      at = end + 1
    } else if (char === '"' || char === '`') {
      const close = char
      let end = at + 1
      while (end < sql.length && !(sql[end] === close && sql[end + 1] !== close)) end += sql[end] === close ? 2 : 1
      const value = sql.slice(at + 1, end).replaceAll(close + close, close)
      tokens.push({ kind: 'identifier', value, text: value, start: at })
      at = end + 1
    } else if (char === '$' && match(DOLLAR_TAG)) {
      // A dollar-quoted body of a function: a string that may hold anything, semicolons too.
      const tag = match(DOLLAR_TAG)![0]
      const end = sql.indexOf(tag, at + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      tokens.push({ kind: 'string', value: sql.slice(at + tag.length, end === -1 ? sql.length : end), text: sql.slice(at, stop), start: at })
      at = stop
    } else if (match(WORD)) {
      const text = match(WORD)![0]
      tokens.push({ kind: 'word', value: text.toUpperCase(), text, start: at })
      at += text.length
    } else if (match(NUMBER)) {
      const text = match(NUMBER)![0]
      tokens.push({ kind: 'number', value: text, text, start: at })
      at += text.length
    } else {
      const symbol = sql.startsWith('::', at) ? '::' : char
      tokens.push({ kind: 'symbol', value: symbol, text: symbol, start: at })
      at += symbol.length
    }
  }
  return tokens
}

/** Words that end the type of a column and start one of its constraints. */
const COLUMN_CONSTRAINTS = new Set([
  'CONSTRAINT',
  'PRIMARY',
  'NOT',
  'NULL',
  'UNIQUE',
  'DEFAULT',
  'REFERENCES',
  'CHECK',
  'GENERATED',
  'COLLATE',
  'AUTO_INCREMENT',
  'AUTOINCREMENT',
  'COMMENT',
  'ON',
  'IDENTITY',
])

/** Words that start a constraint of a table rather than a column. */
const TABLE_CONSTRAINTS = new Set(['CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'EXCLUDE', 'LIKE', 'INDEX', 'KEY', 'FULLTEXT', 'SPATIAL'])

/** Reads the tokens of one statement. */
class Reader {
  private at = 0
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  get done() {
    return this.at >= this.tokens.length
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.at + offset]
  }

  /** Whether the next tokens are these words or symbols, without taking them. */
  sees(...values: string[]): boolean {
    return values.every((value, index) => {
      const token = this.peek(index)
      return token !== undefined && token.kind !== 'identifier' && token.kind !== 'string' && token.value === value
    })
  }

  /** Takes the words or symbols when they come next. */
  take(...values: string[]): boolean {
    if (!this.sees(...values)) return false
    this.at += values.length
    return true
  }

  next(): Token | undefined {
    return this.tokens[this.at++]
  }

  /** An identifier, perhaps qualified (`schema.table`): its last part. */
  name(): string | null {
    let name = this.identifier()
    while (name !== null && this.take('.')) name = this.identifier()
    return name
  }

  identifier(): string | null {
    const token = this.peek()
    if (!token || (token.kind !== 'word' && token.kind !== 'identifier')) return null
    this.at++
    return token.kind === 'word' ? token.text.toLowerCase() : token.value
  }

  /** `(a, b)`: the names in parentheses; empty when there are none. */
  names(): string[] {
    if (!this.take('(')) return []
    const names: string[] = []
    while (!this.done && !this.take(')')) {
      const name = this.identifier()
      if (name !== null) names.push(name)
      else this.next()
      this.take(',')
    }
    return names
  }

  /** Skips a group in parentheses, with the groups inside it. */
  skipGroup() {
    if (!this.sees('(')) return
    let depth = 0
    do {
      const token = this.next()
      if (token?.value === '(' && token.kind === 'symbol') depth++
      if (token?.value === ')' && token.kind === 'symbol') depth--
    } while (!this.done && depth > 0)
  }

  /** Tokens up to the next comma at this depth, or up to the end; the comma is taken. */
  element(): Token[] {
    const element: Token[] = []
    let depth = 0
    while (!this.done) {
      const token = this.peek()!
      if (token.kind === 'symbol' && token.value === ',' && depth === 0) {
        this.at++
        break
      }
      if (token.kind === 'symbol' && token.value === '(') depth++
      if (token.kind === 'symbol' && token.value === ')') {
        if (depth === 0) break
        depth--
      }
      element.push(token)
      this.at++
    }
    return element
  }
}

/** Splits the tokens into statements at the semicolons. */
function statements(tokens: Token[]): Token[][] {
  const result: Token[][] = [[]]
  for (const token of tokens) {
    if (token.kind === 'symbol' && token.value === ';') result.push([])
    else result.at(-1)!.push(token)
  }
  return result.filter((statement) => statement.length > 0)
}

/** The type of a column as written: words with spaces between them, arguments in parentheses without. */
export function typeText(tokens: Token[]): string {
  let text = ''
  let previous: Token | null = null
  for (const token of tokens) {
    const isTerm = token.kind !== 'symbol'
    const afterTerm = previous !== null && (previous.kind !== 'symbol' || previous.value === ')' || previous.value === ',')
    if (isTerm && afterTerm) text += ' '
    text += token.kind === 'word' ? token.text.toLowerCase() : token.kind === 'string' ? token.text : token.value
    previous = token
  }
  return text
}

interface ColumnDefinition {
  column: SqlColumn
  foreignKey: SqlForeignKey | null
}

/** A column with its constraints: `name type [CONSTRAINT x] [NOT NULL] [PRIMARY KEY] [REFERENCES t (c)] …`. */
function columnDefinition(tokens: Token[]): ColumnDefinition | null {
  const reader = new Reader(tokens)
  const name = reader.identifier()
  if (name === null) return null
  const type: Token[] = []
  let depth = 0
  while (!reader.done) {
    const token = reader.peek()!
    if (depth === 0 && token.kind === 'word' && COLUMN_CONSTRAINTS.has(token.value)) break
    if (token.kind === 'symbol' && token.value === '(') depth++
    if (token.kind === 'symbol' && token.value === ')') depth--
    type.push(reader.next()!)
  }
  const column: SqlColumn = { name, type: typeText(type) || 'text', notNull: false, primaryKey: false, unique: false }
  let foreignKey: SqlForeignKey | null = null
  let constraint: string | null = null
  while (!reader.done) {
    if (reader.take('CONSTRAINT')) constraint = reader.identifier()
    else if (reader.take('PRIMARY', 'KEY')) {
      column.primaryKey = true
      column.notNull = true
    } else if (reader.take('NOT', 'NULL')) column.notNull = true
    else if (reader.take('NULL')) column.notNull = false
    else if (reader.take('UNIQUE')) {
      column.unique = true
      reader.take('KEY')
    } else if (reader.take('REFERENCES')) {
      const table = reader.name()
      if (table !== null) foreignKey = { name: constraint, columns: [name], table, references: reader.names() }
    } else if (reader.sees('(')) reader.skipGroup()
    else reader.next()
  }
  return { column, foreignKey }
}

function findTable(schema: SqlSchema, name: string): SqlTable | undefined {
  return schema.tables.find((table) => table.name === name)
}

/** A constraint of a table: primary key, foreign key, unique columns, or an index of MySQL (`INDEX`, `KEY`). */
function tableConstraint(table: SqlTable, tokens: Token[]) {
  const reader = new Reader(tokens)
  let name = reader.take('CONSTRAINT') ? reader.identifier() : null
  const column = (name: string) => table.columns.find((candidate) => candidate.name === name)
  if (reader.take('PRIMARY', 'KEY')) {
    for (const name of reader.names()) {
      const found = column(name)
      if (found) Object.assign(found, { primaryKey: true, notNull: true })
    }
  } else if (reader.take('FOREIGN', 'KEY')) {
    const columns = reader.names()
    if (!reader.take('REFERENCES')) return
    const referenced = reader.name()
    if (referenced !== null && columns.length > 0) {
      table.foreignKeys.push({ name, columns, table: referenced, references: reader.names() })
    }
  } else if (reader.take('UNIQUE')) {
    if (reader.take('KEY') || reader.take('INDEX')) name = (reader.sees('(') ? null : reader.identifier()) ?? name
    const columns = reader.names()
    if (columns.length === 1) {
      const found = column(columns[0]!)
      if (found) found.unique = true
    } else if (columns.length > 1) {
      addIndex(table, name, columns.map(writtenName).join(', '), true, 'key')
    }
  } else if (reader.take('INDEX') || reader.take('KEY')) {
    const indexName = reader.sees('(') ? null : reader.identifier()
    const columns = reader.names()
    if (columns.length > 0) addIndex(table, indexName, columns.map(writtenName).join(', '), false, 'idx')
  }
}

/** Adds an index to the table, with the name PostgreSQL would give it when it has none; it replaces one of its name. */
function addIndex(table: SqlTable, name: string | null, columns: string, unique: boolean, suffix: 'idx' | 'key', method = '', rest = '') {
  const index: SqlIndex = { name: name ?? defaultIndexName(table.name, columns, suffix), columns, unique, method, rest }
  table.indexes = table.indexes.filter((existing) => existing.name !== index.name)
  table.indexes.push(index)
}

function addColumn(table: SqlTable, tokens: Token[]) {
  const definition = columnDefinition(tokens)
  if (!definition) return
  table.columns = table.columns.filter((column) => column.name !== definition.column.name)
  table.columns.push(definition.column)
  if (definition.foreignKey) table.foreignKeys.push(definition.foreignKey)
}

function createTable(schema: SqlSchema, reader: Reader): boolean {
  reader.take('IF', 'NOT', 'EXISTS')
  const name = reader.name()
  if (name === null || !reader.take('(')) return false
  const table: SqlTable = { name, columns: [], foreignKeys: [], indexes: [] }
  const constraints: Token[][] = []
  while (!reader.done && !reader.sees(')')) {
    const element = reader.element()
    const first = element[0]
    if (!first) continue
    if (first.kind === 'word' && TABLE_CONSTRAINTS.has(first.value)) constraints.push(element)
    else addColumn(table, element)
  }
  // Constraints of the table may name columns declared after them.
  for (const constraint of constraints) tableConstraint(table, constraint)
  schema.tables = schema.tables.filter((existing) => existing.name !== name)
  schema.tables.push(table)
  return true
}

function alterTable(schema: SqlSchema, reader: Reader): boolean {
  reader.take('IF', 'EXISTS')
  reader.take('ONLY')
  const name = reader.name()
  const table = name === null ? undefined : findTable(schema, name)
  if (!table) return false
  while (!reader.done) {
    const action = new Reader(reader.element())
    if (action.take('ADD')) {
      const next = action.peek()
      if (next?.kind === 'word' && TABLE_CONSTRAINTS.has(next.value)) {
        tableConstraint(table, rest(action))
      } else {
        action.take('COLUMN')
        action.take('IF', 'NOT', 'EXISTS')
        addColumn(table, rest(action))
      }
    } else if (action.take('DROP')) {
      if (action.take('CONSTRAINT')) {
        action.take('IF', 'EXISTS')
        const constraint = action.identifier()
        table.foreignKeys = table.foreignKeys.filter((foreignKey) => foreignKey.name !== constraint)
        table.indexes = table.indexes.filter((index) => index.name !== constraint)
      } else {
        action.take('COLUMN')
        action.take('IF', 'EXISTS')
        const column = action.identifier()
        table.columns = table.columns.filter((candidate) => candidate.name !== column)
        table.foreignKeys = table.foreignKeys.filter((foreignKey) => !foreignKey.columns.includes(column ?? ''))
        // PostgreSQL drops the indexes of a dropped column.
        table.indexes = table.indexes.filter((index) => !hasColumn(index, column ?? ''))
      }
    } else if (action.take('RENAME')) {
      if (action.take('TO')) {
        const renamed = action.name()
        if (renamed !== null) renameTable(schema, table, renamed)
      } else if (!action.sees('CONSTRAINT')) {
        action.take('COLUMN')
        const from = action.identifier()
        action.take('TO')
        const to = action.identifier()
        if (from !== null && to !== null) renameColumn(schema, table, from, to)
      }
    } else if (action.take('ALTER')) {
      action.take('COLUMN')
      const name = action.identifier()
      const column = table.columns.find((candidate) => candidate.name === name)
      if (!column) continue
      if (action.take('SET', 'NOT', 'NULL')) column.notNull = true
      else if (action.take('DROP', 'NOT', 'NULL')) column.notNull = false
      else if (action.take('SET', 'DATA', 'TYPE') || action.take('TYPE')) {
        const type: Token[] = []
        while (!action.done && !action.sees('USING') && !action.sees('COLLATE')) type.push(action.next()!)
        column.type = typeText(type) || column.type
      }
    }
  }
  return true
}

/** The rest of the tokens of a reader. */
function rest(reader: Reader): Token[] {
  const tokens: Token[] = []
  while (!reader.done) tokens.push(reader.next()!)
  return tokens
}

function renameTable(schema: SqlSchema, table: SqlTable, name: string) {
  for (const other of schema.tables) {
    for (const foreignKey of other.foreignKeys) if (foreignKey.table === table.name) foreignKey.table = name
  }
  table.name = name
}

function renameColumn(schema: SqlSchema, table: SqlTable, from: string, to: string) {
  const column = table.columns.find((candidate) => candidate.name === from)
  if (column) column.name = to
  const rename = (names: string[]) => names.map((name) => (name === from ? to : name))
  for (const foreignKey of table.foreignKeys) foreignKey.columns = rename(foreignKey.columns)
  for (const index of table.indexes) index.columns = renameIndexColumn(index.columns, from, writtenName(to))
  for (const other of schema.tables) {
    for (const foreignKey of other.foreignKeys) {
      if (foreignKey.table === table.name) foreignKey.references = rename(foreignKey.references)
    }
  }
}

const hasColumn = (index: SqlIndex, column: string) =>
  indexColumnNames(index.columns).some((name) => name.toLowerCase() === column.toLowerCase())

/**
 * `CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] [name] ON [ONLY] table [USING method] (…) …`: an index of a
 * table of the schema, with its columns and what follows them as written in `sql`.
 */
function createIndex(schema: SqlSchema, reader: Reader, unique: boolean, sql: string): boolean {
  reader.take('CONCURRENTLY')
  reader.take('IF', 'NOT', 'EXISTS')
  const name = reader.sees('ON') ? null : reader.name()
  if (!reader.take('ON')) return false
  reader.take('ONLY')
  const tableName = reader.name()
  const table = tableName === null ? undefined : findTable(schema, tableName)
  if (!table) return false
  const method = reader.take('USING') ? (reader.next()?.text ?? '') : ''
  const tokens = rest(reader)
  if (tokens[0]?.kind !== 'symbol' || tokens[0].value !== '(') return false
  let close = 0
  for (let depth = 0; close < tokens.length; close++) {
    const token = tokens[close]!
    if (token.kind === 'symbol' && token.value === '(') depth++
    if (token.kind === 'symbol' && token.value === ')' && --depth === 0) break
  }
  const source = (from: number, to: number) =>
    from >= Math.min(to, tokens.length) ? '' : sql.slice(tokens[from]!.start, tokenEnd(tokens[Math.min(to, tokens.length) - 1]!, sql)).trim()
  addIndex(table, name, source(1, close), unique, 'idx', method, source(close + 1, tokens.length))
  return true
}

function dropIndexes(schema: SqlSchema, reader: Reader): boolean {
  reader.take('CONCURRENTLY')
  reader.take('IF', 'EXISTS')
  const names = new Set<string>()
  do {
    const name = reader.name()
    if (name !== null) names.add(name)
  } while (reader.take(','))
  for (const table of schema.tables) table.indexes = table.indexes.filter((index) => !names.has(index.name))
  return names.size > 0
}

function alterIndex(schema: SqlSchema, reader: Reader): boolean {
  reader.take('IF', 'EXISTS')
  const name = reader.name()
  if (name === null || !reader.take('RENAME', 'TO')) return false
  const renamed = reader.name()
  if (renamed === null) return false
  for (const table of schema.tables) {
    for (const index of table.indexes) if (index.name === name) index.name = renamed
  }
  return true
}

function dropTables(schema: SqlSchema, reader: Reader): boolean {
  reader.take('IF', 'EXISTS')
  const names = new Set<string>()
  do {
    const name = reader.name()
    if (name !== null) names.add(name)
  } while (reader.take(','))
  schema.tables = schema.tables.filter((table) => !names.has(table.name))
  for (const table of schema.tables) {
    table.foreignKeys = table.foreignKeys.filter((foreignKey) => !names.has(foreignKey.table))
  }
  return names.size > 0
}

function statement(schema: SqlSchema, tokens: Token[], sql: string): boolean {
  const reader = new Reader(tokens)
  if (reader.take('CREATE')) {
    reader.take('OR', 'REPLACE')
    const unique = reader.take('UNIQUE')
    if (reader.take('INDEX')) return createIndex(schema, reader, unique, sql)
    if (unique) return false
    for (const word of ['GLOBAL', 'LOCAL', 'TEMPORARY', 'TEMP', 'UNLOGGED']) reader.take(word)
    if (!reader.take('TABLE')) return false
    // `CREATE TABLE … AS SELECT` and partitions copy another table: they are not drawn.
    if (tokens.some((token) => token.kind === 'word' && (token.value === 'AS' || token.value === 'PARTITION'))) {
      const parenthesis = tokens.findIndex((token) => token.kind === 'symbol' && token.value === '(')
      const as = tokens.findIndex((token) => token.kind === 'word' && (token.value === 'AS' || token.value === 'PARTITION'))
      if (parenthesis === -1 || as < parenthesis) return false
    }
    return createTable(schema, reader)
  }
  if (reader.take('ALTER', 'TABLE')) return alterTable(schema, reader)
  if (reader.take('DROP', 'TABLE')) return dropTables(schema, reader)
  if (reader.take('ALTER', 'INDEX')) return alterIndex(schema, reader)
  if (reader.take('DROP', 'INDEX')) return dropIndexes(schema, reader)
  return false
}

/**
 * Applies the DDL of PostgreSQL (and the common part of MySQL) to the schema: `CREATE TABLE`, `ALTER TABLE` that adds,
 * drops, renames and changes columns and constraints, `DROP TABLE`, `CREATE INDEX`, `DROP INDEX` and renaming an index.
 * Other statements are counted as skipped.
 */
export function parseSql(sql: string, schema: SqlSchema = { tables: [], skipped: 0 }): SqlSchema {
  for (const tokens of statements(tokenize(sql))) {
    if (!statement(schema, tokens, sql)) schema.skipped++
  }
  return schema
}

/** A file of SQL, e.g. a migration of Flyway. */
export interface SqlFile {
  name: string
  text: string
}

const MIGRATION = /^([VR])(?:(\d+(?:[._]\d+)*))?__/i

/**
 * Files in the order a database gets them: migrations of Flyway by version (`V1__`, `V1_1__`, `V2__`), repeatable
 * ones (`R__`) after them, other files by name; undo migrations (`U1__`) are left out.
 */
export function orderSqlFiles(files: SqlFile[]): SqlFile[] {
  const version = (name: string) => MIGRATION.exec(name)?.[2]?.split(/[._]/).map(Number) ?? null
  const rank = (name: string) => {
    const match = MIGRATION.exec(name)
    if (!match) return 2
    return match[1]!.toUpperCase() === 'V' ? 0 : 1
  }
  const compareVersions = (a: number[], b: number[]) => {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
      const difference = (a[index] ?? 0) - (b[index] ?? 0)
      if (difference !== 0) return difference
    }
    return 0
  }
  return files
    .filter((file) => !/^U\d/i.test(file.name))
    .sort((a, b) => {
      const byRank = rank(a.name) - rank(b.name)
      if (byRank !== 0) return byRank
      const [va, vb] = [version(a.name), version(b.name)]
      if (va && vb) return compareVersions(va, vb) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
}

/** The schema that the files make, in the order a database gets them. */
export function parseSqlFiles(files: SqlFile[]): SqlSchema {
  const schema: SqlSchema = { tables: [], skipped: 0 }
  for (const file of orderSqlFiles(files)) parseSql(file.text, schema)
  return schema
}
