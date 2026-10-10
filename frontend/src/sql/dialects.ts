import type { DbVendorId } from './dbVendors.ts'
import { quoteName } from './erDiagram.ts'
import type { SqlIndex } from './parseSql.ts'
import { mapIndexColumns } from './tableIndex.ts'
import { sqlMessages as m } from './messages.ts'

/**
 * Databases a migration is written for: each turns the steps of a migration into its own statements, or into a comment
 * that says why it cannot take the step.
 */

/** A column as a migration writes it: the type as the field writes it. */
export interface ColumnDefinition {
  name: string
  type: string
  notNull: boolean
}

export interface ForeignKeyDefinition {
  name: string
  table: string
  column: string
  referencedTable: string
  referencedColumn: string
}

export interface TableDefinition {
  name: string
  columns: ColumnDefinition[]
  primaryKey: { name: string; columns: string[] } | null
  /** Unique columns written into `CREATE TABLE`. */
  uniques: { name: string; column: string }[]
  /** Foreign keys written into `CREATE TABLE`, for a database that adds none later. */
  foreignKeys: ForeignKeyDefinition[]
}

/** Named things of a table whose names a migration derives or takes from the board. */
export type ConstraintKind = 'primaryKey' | 'unique' | 'foreignKey' | 'index'

/** A step of a migration, whatever the database: names are final, types as the fields write them. */
export type Operation =
  | { type: 'dropForeignKey'; foreignKey: ForeignKeyDefinition }
  | { type: 'dropIndex'; table: string; index: SqlIndex }
  | { type: 'dropUnique'; table: string; name: string; column: string }
  | { type: 'dropPrimaryKey'; table: string; name: string }
  | { type: 'dropColumn'; table: string; column: string }
  | { type: 'dropTable'; table: string }
  | { type: 'renameTable'; from: string; to: string }
  | { type: 'renameColumn'; table: string; from: string; to: string }
  | { type: 'renameConstraint'; table: string; kind: ConstraintKind; from: string; to: string }
  | { type: 'createTable'; table: TableDefinition }
  | { type: 'addColumn'; table: string; column: ColumnDefinition }
  | { type: 'alterColumn'; table: string; from: ColumnDefinition; to: ColumnDefinition; retyped: boolean }
  | { type: 'addPrimaryKey'; table: string; name: string; columns: string[] }
  | { type: 'addUnique'; table: string; name: string; column: string }
  | { type: 'createIndex'; table: string; index: SqlIndex }
  | { type: 'addForeignKey'; foreignKey: ForeignKeyDefinition }

/** A step written for a database. */
export interface Rendered {
  /** Whole statements with their semicolons; none when the database cannot take the step. */
  sql: string[]
  /** Comments before the statements: what to mind, or why the database cannot take the step. */
  notes: string[]
  unsupported: boolean
}

/** What becomes of a constraint whose name changes: renamed, dropped and added again, or nothing, as no one uses it. */
export type RenamePolicy = 'rename' | 'recreate' | 'keep'

export interface SqlDialect {
  id: DbVendorId
  label: string
  /** The name as the database writes it: in quotes when it is not a plain identifier or is a reserved word. */
  quote(name: string): string
  /** The longest name of a constraint, in bytes, that the database takes. */
  maxNameBytes: number
  renames: Record<ConstraintKind, RenamePolicy>
  /** Unique columns and foreign keys of a new table that go into its `CREATE TABLE`; the others are added after it. */
  inline: { uniques: boolean; foreignKeys: boolean }
  /** The database changes the type of a column only after the indexes and keys with the column are dropped. */
  rebuildsKeysOnRetype: boolean
  render(operation: Operation): Rendered
}

const statements = (...sql: string[]): Rendered => ({ sql, notes: [], unsupported: false })
const noted = (notes: string[], ...sql: string[]): Rendered => ({ sql, notes, unsupported: false })
const unsupported = (note: string): Rendered => ({ sql: [], notes: [note], unsupported: true })

/** Words that PostgreSQL reserves are those of {@link quoteName}; this list is wider, for the databases below. */
const RESERVED = new Set(
  (
    'abort action add after all alter analyze and as asc attach autoincrement backup before begin between bigint binary ' +
    'blob both break browse bulk by call cascade case change char character check checkpoint close clustered coalesce ' +
    'collate column commit compute condition conflict constraint contains continue convert create cross current ' +
    'current_date current_time current_timestamp current_user cursor database databases date dbcc deallocate dec decimal ' +
    'declare default deferrable deferred delayed delete deny desc describe detach deterministic disk distinct distinctrow ' +
    'distributed div double drop dual dump each else elseif end errlvl escape except exclusive exec execute exists exit ' +
    'explain external fail false fetch file fillfactor float for force foreign freetext from full fulltext function ' +
    'generated glob goto grant group grouping groups having holdlock identity identitycol if ignore immediate in index ' +
    'indexed infile initially inner inout insert instead int integer intersect interval into is isnull iterate join key ' +
    'keys kill lateral leading leave left like limit lineno lines load localtime localtimestamp lock long loop match merge ' +
    'mod national natural nocheck nonclustered not nothing notnull null nullif numeric of off offset offsets on open ' +
    'optimize option optionally or order out outer over partition percent pivot plan pragma precision primary print proc ' +
    'procedure public raise raiserror range read real recursive references regexp reindex release rename repeat replace ' +
    'require restrict return revoke right rlike rollback row rowcount rows rule savepoint schema select session_user set ' +
    'show smallint some spatial sql statistics system_user table tablesample temp temporary then time timestamp tinyint ' +
    'to top trailing tran transaction trigger true truncate union unique unlock unpivot unsigned update usage use user ' +
    'using vacuum values varbinary varchar varying view virtual waitfor when where while window with within write xor ' +
    'year_month zerofill'
  ).split(' '),
)

/** Words that Oracle reserves. Quotes make a name case-sensitive there, so only these and names that are not plain get them. */
const ORACLE_RESERVED = new Set(
  (
    'ACCESS ADD ALL ALTER AND ANY AS ASC AUDIT BETWEEN BY CHAR CHECK CLUSTER COLUMN COMMENT COMPRESS CONNECT CREATE ' +
    'CURRENT DATE DECIMAL DEFAULT DELETE DESC DISTINCT DROP ELSE EXCLUSIVE EXISTS FILE FLOAT FOR FROM GRANT GROUP HAVING ' +
    'IDENTIFIED IMMEDIATE IN INCREMENT INDEX INITIAL INSERT INTEGER INTERSECT INTO IS LEVEL LIKE LOCK LONG MAXEXTENTS ' +
    'MINUS MLSLABEL MODE MODIFY NOAUDIT NOCOMPRESS NOT NOWAIT NULL NUMBER OF OFFLINE ON ONLINE OPTION OR ORDER PCTFREE ' +
    'PRIOR PUBLIC RAW RENAME RESOURCE REVOKE ROW ROWID ROWNUM ROWS SELECT SESSION SET SHARE SIZE SMALLINT START ' +
    'SUCCESSFUL SYNONYM SYSDATE TABLE THEN TO TRIGGER UID UNION UNIQUE UPDATE USER VALIDATE VALUES VARCHAR VARCHAR2 VIEW ' +
    'WHENEVER WHERE WITH'
  ).split(' '),
)

/** Quotes a name that is not `plain` or is reserved, with `open` and `close`; a `close` inside is written `escape`. */
function quoter(plain: RegExp, reserved: (name: string) => boolean, open: string, close: string, escape: string) {
  return (name: string) => (plain.test(name) && !reserved(name) ? name : `${open}${name.replaceAll(close, escape)}${close}`)
}

const isReserved = (name: string) => RESERVED.has(name.toLowerCase())

/** A string literal of SQL Server. */
const literal = (text: string) => `N'${text.replaceAll("'", "''")}'`

/** How a database writes each step. */
type Renderers = { [Type in Operation['type']]: (operation: Extract<Operation, { type: Type }>) => Rendered }

const NOT_NULL_WITHOUT_DEFAULT = (table: string, column: string) => m.notNullWithoutDefault(table, column)

const skippedMethod = (method: string, label: string) => m.skippedMethod(method, label)

/** The statements of the standard SQL with the quotes of `q`: each database overrides what it writes otherwise. */
function standard(q: (name: string) => string): Renderers {
  const columns = (names: string[]) => names.map(q).join(', ')
  const column = ({ name, type, notNull }: ColumnDefinition) => `${q(name)} ${type}${notNull ? ' NOT NULL' : ''}`
  return {
    dropForeignKey: ({ foreignKey }) => statements(`ALTER TABLE ${q(foreignKey.table)} DROP CONSTRAINT ${q(foreignKey.name)};`),
    dropIndex: ({ index }) => statements(`DROP INDEX ${q(index.name)};`),
    dropUnique: ({ table, name }) => statements(`ALTER TABLE ${q(table)} DROP CONSTRAINT ${q(name)};`),
    dropPrimaryKey: ({ table, name }) => statements(`ALTER TABLE ${q(table)} DROP CONSTRAINT ${q(name)};`),
    dropColumn: ({ table, column }) => statements(`ALTER TABLE ${q(table)} DROP COLUMN ${q(column)};`),
    dropTable: ({ table }) => statements(`DROP TABLE ${q(table)};`),
    renameTable: ({ from, to }) => statements(`ALTER TABLE ${q(from)} RENAME TO ${q(to)};`),
    renameColumn: ({ table, from, to }) => statements(`ALTER TABLE ${q(table)} RENAME COLUMN ${q(from)} TO ${q(to)};`),
    renameConstraint: ({ table, kind, from, to }) =>
      statements(
        kind === 'index'
          ? `ALTER INDEX ${q(from)} RENAME TO ${q(to)};`
          : `ALTER TABLE ${q(table)} RENAME CONSTRAINT ${q(from)} TO ${q(to)};`,
      ),
    createTable: ({ table }) => statements(createTable(table, column, q)),
    addColumn: ({ table, column: added }) =>
      noted(
        added.notNull ? [NOT_NULL_WITHOUT_DEFAULT(table, added.name)] : [],
        `ALTER TABLE ${q(table)} ADD COLUMN ${column(added)};`,
      ),
    alterColumn: ({ table, from, to, retyped }) =>
      statements(
        ...(retyped ? [`ALTER TABLE ${q(table)} ALTER COLUMN ${q(to.name)} TYPE ${to.type};`] : []),
        ...(from.notNull !== to.notNull
          ? [`ALTER TABLE ${q(table)} ALTER COLUMN ${q(to.name)} ${to.notNull ? 'SET' : 'DROP'} NOT NULL;`]
          : []),
      ),
    addPrimaryKey: ({ table, name, columns: names }) =>
      statements(`ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(name)} PRIMARY KEY (${columns(names)});`),
    addUnique: ({ table, name, column: unique }) =>
      statements(`ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(name)} UNIQUE (${q(unique)});`),
    createIndex: ({ table, index }) => statements(createIndex(table, index, q, '')),
    addForeignKey: ({ foreignKey }) =>
      statements(`ALTER TABLE ${q(foreignKey.table)} ADD CONSTRAINT ${q(foreignKey.name)} ${foreignKeyClause(foreignKey, q)};`),
  }
}

function foreignKeyClause(key: ForeignKeyDefinition, q: (name: string) => string): string {
  return `FOREIGN KEY (${q(key.column)}) REFERENCES ${q(key.referencedTable)} (${q(key.referencedColumn)})`
}

/** Lines of the constraints of `CREATE TABLE` for a database that writes them otherwise than the standard SQL. */
interface ConstraintLines {
  primaryKey?: (columns: string) => string
  unique?: (name: string, column: string) => string
}

/** `CREATE TABLE` with a line per column and per constraint; `tail` follows the closing parenthesis. */
function createTable(
  table: TableDefinition,
  column: (column: ColumnDefinition) => string,
  q: (name: string) => string,
  lines: ConstraintLines = {},
  tail = ';',
): string {
  const definitions = table.columns.map(column)
  if (table.primaryKey) {
    const columns = table.primaryKey.columns.map(q).join(', ')
    definitions.push(lines.primaryKey?.(columns) ?? `CONSTRAINT ${q(table.primaryKey.name)} PRIMARY KEY (${columns})`)
  }
  for (const unique of table.uniques) {
    definitions.push(lines.unique?.(unique.name, unique.column) ?? `CONSTRAINT ${q(unique.name)} UNIQUE (${q(unique.column)})`)
  }
  for (const key of table.foreignKeys) definitions.push(`CONSTRAINT ${q(key.name)} ${foreignKeyClause(key, q)}`)
  return `CREATE TABLE ${q(table.name)} (\n${definitions.map((line) => `    ${line}`).join(',\n')}\n)${tail}`
}

/**
 * `CREATE INDEX` with the columns in the quotes of the database; `method` and `methodAfter` are how the database writes
 * the method of the index before and after the columns, if at all.
 */
function createIndex(table: string, index: SqlIndex, q: (name: string) => string, method: string, methodAfter = ''): string {
  const columns = mapIndexColumns(index.columns, q)
  return (
    `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${q(index.name)} ON ${q(table)}${method} (${columns})` +
    `${methodAfter}${index.rest ? ` ${index.rest}` : ''};`
  )
}

/** `CREATE INDEX` of a database that writes no method: the method of the index is skipped with a note. */
function withoutMethod(q: (name: string) => string, label: string): Renderers['createIndex'] {
  return ({ table, index }) => {
    const sql = createIndex(table, index, q, '')
    return index.method ? noted([skippedMethod(index.method, label)], sql) : statements(sql)
  }
}

function dialect(definition: Omit<SqlDialect, 'render'>, renderers: Renderers): SqlDialect {
  return {
    ...definition,
    render: (operation) => (renderers[operation.type] as (operation: Operation) => Rendered)(operation),
  }
}

const RENAME_ALL: Record<ConstraintKind, RenamePolicy> = {
  primaryKey: 'rename',
  unique: 'rename',
  foreignKey: 'rename',
  index: 'rename',
}

const postgresql = (() => {
  const q = quoteName
  const base = standard(q)
  return dialect(
    {
      id: 'postgresql',
      label: 'PostgreSQL',
      quote: q,
      maxNameBytes: 63,
      renames: RENAME_ALL,
      inline: { uniques: true, foreignKeys: false },
      rebuildsKeysOnRetype: false,
    },
    {
      ...base,
      alterColumn: ({ table, from, to, retyped }) =>
        statements(
          // An explicit cast converts what an assignment cast would not, e.g. text to integer.
          ...(retyped
            ? [`ALTER TABLE ${q(table)} ALTER COLUMN ${q(to.name)} TYPE ${to.type} USING ${q(to.name)}::${to.type};`]
            : []),
          ...base.alterColumn({ type: 'alterColumn', table, from, to, retyped: false }).sql,
        ),
      createIndex: ({ table, index }) => statements(createIndex(table, index, q, index.method ? ` USING ${index.method}` : '')),
    },
  )
})()

const mysql = (() => {
  const q = quoter(/^[A-Za-z_][A-Za-z0-9_$]*$/, isReserved, '`', '`', '``')
  const base = standard(q)
  const column = ({ name, type, notNull }: ColumnDefinition) => `${q(name)} ${type}${notNull ? ' NOT NULL' : ''}`
  return dialect(
    {
      id: 'mysql',
      label: 'MySQL / MariaDB',
      quote: q,
      maxNameBytes: 64,
      // The primary key is always named PRIMARY; a foreign key cannot be renamed.
      renames: { primaryKey: 'keep', unique: 'rename', foreignKey: 'recreate', index: 'rename' },
      inline: { uniques: true, foreignKeys: false },
      rebuildsKeysOnRetype: false,
    },
    {
      ...base,
      dropForeignKey: ({ foreignKey }) =>
        statements(`ALTER TABLE ${q(foreignKey.table)} DROP FOREIGN KEY ${q(foreignKey.name)};`),
      dropIndex: ({ table, index }) => statements(`DROP INDEX ${q(index.name)} ON ${q(table)};`),
      dropUnique: ({ table, name }) => statements(`ALTER TABLE ${q(table)} DROP INDEX ${q(name)};`),
      dropPrimaryKey: ({ table }) => statements(`ALTER TABLE ${q(table)} DROP PRIMARY KEY;`),
      renameConstraint: ({ table, from, to }) => statements(`ALTER TABLE ${q(table)} RENAME INDEX ${q(from)} TO ${q(to)};`),
      createTable: ({ table }) =>
        statements(
          createTable(table, column, q, {
            primaryKey: (columns) => `PRIMARY KEY (${columns})`,
            unique: (name, unique) => `UNIQUE KEY ${q(name)} (${q(unique)})`,
          }),
        ),
      addColumn: ({ table, column: added }) => statements(`ALTER TABLE ${q(table)} ADD COLUMN ${column(added)};`),
      alterColumn: ({ table, to }) =>
        noted(
          [m.mysqlModify],
          `ALTER TABLE ${q(table)} MODIFY COLUMN ${column(to)};`,
        ),
      addPrimaryKey: ({ table, columns }) =>
        statements(`ALTER TABLE ${q(table)} ADD PRIMARY KEY (${columns.map(q).join(', ')});`),
      addUnique: ({ table, name, column: unique }) =>
        statements(`ALTER TABLE ${q(table)} ADD UNIQUE KEY ${q(name)} (${q(unique)});`),
      createIndex: ({ table, index }) => {
        const method = index.method.toUpperCase()
        if (!index.method || method === 'BTREE' || method === 'HASH') {
          return statements(createIndex(table, index, q, '', index.method ? ` USING ${method}` : ''))
        }
        return noted([skippedMethod(index.method, 'MySQL')], createIndex(table, index, q, ''))
      },
    },
  )
})()

const oracle = (() => {
  const q = quoter(/^[A-Za-z][A-Za-z0-9_$#]*$/, (name) => ORACLE_RESERVED.has(name.toUpperCase()), '"', '"', '""')
  const base = standard(q)
  const column = ({ name, type, notNull }: ColumnDefinition) => `${q(name)} ${type}${notNull ? ' NOT NULL' : ''}`
  return dialect(
    {
      id: 'oracle',
      label: 'Oracle',
      quote: q,
      maxNameBytes: 128,
      renames: RENAME_ALL,
      inline: { uniques: true, foreignKeys: false },
      rebuildsKeysOnRetype: false,
    },
    {
      ...base,
      addColumn: ({ table, column: added }) =>
        noted(
          added.notNull ? [NOT_NULL_WITHOUT_DEFAULT(table, added.name)] : [],
          `ALTER TABLE ${q(table)} ADD ${column(added)};`,
        ),
      // Oracle rejects NOT NULL or NULL that the column has already.
      alterColumn: ({ table, from, to, retyped }) =>
        statements(
          `ALTER TABLE ${q(table)} MODIFY ${[
            q(to.name),
            retyped && to.type,
            from.notNull !== to.notNull && (to.notNull ? 'NOT NULL' : 'NULL'),
          ]
            .filter(Boolean)
            .join(' ')};`,
        ),
      createIndex: withoutMethod(q, 'Oracle'),
    },
  )
})()

const sqlserver = (() => {
  const q = quoter(/^[A-Za-z_][A-Za-z0-9_]*$/, isReserved, '[', ']', ']]')
  const base = standard(q)
  // Without NULL, a column of SQL Server is nullable or not as the settings of the session say.
  const column = ({ name, type, notNull }: ColumnDefinition) => `${q(name)} ${type} ${notNull ? 'NOT NULL' : 'NULL'}`
  return dialect(
    {
      id: 'sqlserver',
      label: 'SQL Server',
      quote: q,
      maxNameBytes: 128,
      renames: RENAME_ALL,
      inline: { uniques: true, foreignKeys: false },
      rebuildsKeysOnRetype: true,
    },
    {
      ...base,
      dropIndex: ({ table, index }) => statements(`DROP INDEX ${q(index.name)} ON ${q(table)};`),
      renameTable: ({ from, to }) => statements(`EXEC sp_rename ${literal(q(from))}, ${literal(to)};`),
      renameColumn: ({ table, from, to }) =>
        statements(`EXEC sp_rename ${literal(`${q(table)}.${q(from)}`)}, ${literal(to)}, N'COLUMN';`),
      renameConstraint: ({ table, kind, from, to }) =>
        statements(
          kind === 'index'
            ? `EXEC sp_rename ${literal(`${q(table)}.${q(from)}`)}, ${literal(to)}, N'INDEX';`
            : `EXEC sp_rename ${literal(q(from))}, ${literal(to)}, N'OBJECT';`,
        ),
      createTable: ({ table }) => statements(createTable(table, column, q)),
      addColumn: ({ table, column: added }) =>
        noted(
          added.notNull ? [NOT_NULL_WITHOUT_DEFAULT(table, added.name)] : [],
          `ALTER TABLE ${q(table)} ADD ${column(added)};`,
        ),
      alterColumn: ({ table, to }) => statements(`ALTER TABLE ${q(table)} ALTER COLUMN ${column(to)};`),
      createIndex: withoutMethod(q, 'SQL Server'),
    },
  )
})()

const sqlite = (() => {
  const q = quoter(/^[A-Za-z_][A-Za-z0-9_]*$/, isReserved, '"', '"', '""')
  const base = standard(q)
  return dialect(
    {
      id: 'sqlite',
      label: 'SQLite',
      quote: q,
      maxNameBytes: Infinity,
      // Unique columns are unique indexes, which have no rename; keys of a table cannot be dropped, so names are not used.
      renames: { primaryKey: 'keep', unique: 'recreate', foreignKey: 'keep', index: 'recreate' },
      inline: { uniques: false, foreignKeys: true },
      rebuildsKeysOnRetype: false,
    },
    {
      ...base,
      dropForeignKey: ({ foreignKey }) =>
        unsupported(m.sqliteDropForeignKey(foreignKey.name, foreignKey.table, m.sqliteRebuild)),
      dropUnique: ({ name }) => statements(`DROP INDEX ${q(name)};`),
      dropPrimaryKey: ({ table }) => unsupported(m.sqlitePrimaryKey(table, m.sqliteRebuild)),
      addColumn: ({ table, column: added }) =>
        noted(
          added.notNull ? [m.sqliteNotNull(`${table}.${added.name}`)] : [],
          `ALTER TABLE ${q(table)} ADD COLUMN ${q(added.name)} ${added.type}${added.notNull ? ' NOT NULL' : ''};`,
        ),
      alterColumn: ({ table, to }) =>
        unsupported(m.sqliteAlterColumn(`${table}.${to.name}`, m.sqliteRebuild)),
      addPrimaryKey: ({ table }) => unsupported(m.sqlitePrimaryKey(table, m.sqliteRebuild)),
      addUnique: ({ table, name, column }) => statements(`CREATE UNIQUE INDEX ${q(name)} ON ${q(table)} (${q(column)});`),
      createIndex: withoutMethod(q, 'SQLite'),
      addForeignKey: ({ foreignKey }) =>
        unsupported(m.sqliteAddForeignKey(foreignKey.name, foreignKey.table, m.sqliteRebuild)),
    },
  )
})()

const clickhouse = (() => {
  const q = quoter(/^[A-Za-z_][A-Za-z0-9_]*$/, isReserved, '`', '`', '\\`')
  const base = standard(q)
  // Nullability is the type: Nullable(String).
  const column = ({ name, type }: ColumnDefinition) => `${q(name)} ${type}`
  return dialect(
    {
      id: 'clickhouse',
      label: 'ClickHouse',
      quote: q,
      maxNameBytes: Infinity,
      renames: { primaryKey: 'keep', unique: 'keep', foreignKey: 'keep', index: 'keep' },
      inline: { uniques: false, foreignKeys: false },
      rebuildsKeysOnRetype: false,
    },
    {
      ...base,
      dropForeignKey: ({ foreignKey }) => unsupported(m.clickhouseDropForeignKey(foreignKey.name)),
      dropIndex: ({ index }) => unsupported(m.clickhouseDropIndex(index.name)),
      dropUnique: ({ name }) => unsupported(m.clickhouseDropUnique(name)),
      dropPrimaryKey: ({ table }) =>
        unsupported(m.clickhousePrimaryKey(table)),
      renameTable: ({ from, to }) => statements(`RENAME TABLE ${q(from)} TO ${q(to)};`),
      createTable: ({ table }) => {
        const order = table.primaryKey ? `(${table.primaryKey.columns.map(q).join(', ')})` : 'tuple()'
        const definition = { ...table, primaryKey: null }
        return statements(createTable(definition, column, q, {}, `\nENGINE = MergeTree\nORDER BY ${order};`))
      },
      addColumn: ({ table, column: added }) => statements(`ALTER TABLE ${q(table)} ADD COLUMN ${column(added)};`),
      alterColumn: ({ table, to, retyped }) =>
        retyped
          ? statements(`ALTER TABLE ${q(table)} MODIFY COLUMN ${column(to)};`)
          : unsupported(m.clickhouseNullable(`${table}.${to.name}`)),
      addPrimaryKey: ({ table }) =>
        unsupported(m.clickhousePrimaryKey(table)),
      addUnique: ({ table, column }) => unsupported(m.clickhouseAddUnique(`${table}.${column}`)),
      createIndex: ({ index }) => unsupported(m.clickhouseCreateIndex(index.name)),
      addForeignKey: ({ foreignKey }) =>
        unsupported(
          m.clickhouseAddForeignKey(
            `${foreignKey.table}.${foreignKey.column} → ${foreignKey.referencedTable}.${foreignKey.referencedColumn}`,
          ),
        ),
    },
  )
})()

/** The databases of migrations, in the order of the databases of tables. */
export const DIALECTS: Record<DbVendorId, SqlDialect> = { postgresql, mysql, oracle, sqlserver, sqlite, clickhouse }
