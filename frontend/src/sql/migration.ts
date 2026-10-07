import { treeOrder, type BoardSnapshot } from '../diagram/diff.ts'
import { compareCells } from '../diagram/model.ts'
import { vendorOf, type DbVendorId } from './dbVendors.ts'
import type { ColumnDefinition, ConstraintKind, ForeignKeyDefinition, Operation, SqlDialect } from './dialects.ts'
import { diagramTables } from './erDiagram.ts'
import type { SqlIndex } from './parseSql.ts'
import { sameType, widensType } from './sqlTypes.ts'
import { indexColumnNames, mapIndexColumns, writtenName } from './tableIndex.ts'

/**
 * A migration of the schema of a database between two states of a board, e.g. from a version to the board now. Tables,
 * fields and indexes of the two are matched by the ids of their elements, so that a new name is a rename rather than a
 * drop and an add, and the differences become steps in an order that a database takes, written by a {@link SqlDialect}.
 */

/** A column of a table of a state; keys are `<page>/<element>`, as ids of elements are unique on their page only. */
export interface SchemaColumn {
  key: string
  name: string
  /** The type as the field writes it. */
  type: string
  notNull: boolean
  primaryKey: boolean
  unique: boolean
}

export interface SchemaIndex extends SqlIndex {
  key: string
}

/** A foreign key: the column that refers and the column of another table it refers to, by their keys. */
export interface SchemaReference {
  column: string
  referencedTable: string
  referencedColumn: string
}

export interface SchemaTable {
  key: string
  name: string
  /** The database of the table on the board, if it has one. */
  vendor: DbVendorId | null
  columns: SchemaColumn[]
  indexes: SchemaIndex[]
  references: SchemaReference[]
}

/** The tables of the database that a state of a board draws. */
export interface BoardSchema {
  tables: SchemaTable[]
  /** Names of tables drawn more than once, e.g. on two pages: the schema has the first of each. */
  repeated: string[]
}

/** Keeps the first of the items of each name: a database has one table, column or index of a name. */
const firstOfEachName = <T extends { name: string }>(items: T[]) => {
  const names = new Set<string>()
  return items.filter((item) => !names.has(item.name) && names.add(item.name))
}

/**
 * The schema of a state of a board: the tables of all its pages, in the order of the pages and of the elements on each,
 * as the export of SQL reads them — base tables are not tables of the database, the tables that inherit them have the
 * copies of their fields as columns, foreign keys are the edges between fields. Of the tables, columns and indexes of
 * one name the first is taken.
 */
export function boardSchema(board: BoardSnapshot): BoardSchema {
  const tables: SchemaTable[] = []
  const repeated = new Set<string>()
  for (const page of [...board.values()].sort(compareCells)) {
    const key = (id: string) => `${page.id}/${id}`
    const cells = treeOrder(page.cells).map((id) => page.cells.get(id)!)
    for (const drawn of diagramTables(cells)) {
      if (tables.some((table) => table.name === drawn.table.name)) {
        repeated.add(drawn.table.name)
        continue
      }
      const columns = firstOfEachName(
        drawn.fields.map(({ id, column, writtenType }) => ({
          key: key(id),
          name: column.name,
          type: writtenType,
          notNull: column.notNull,
          primaryKey: column.primaryKey,
          unique: column.unique,
        })),
      )
      const references = new Map<string, SchemaReference>()
      for (const reference of drawn.references) {
        const column = key(reference.field)
        if (!columns.some((candidate) => candidate.key === column)) continue
        const referencedColumn = key(reference.referencedField)
        references.set(`${column} ${referencedColumn}`, {
          column,
          referencedTable: key(reference.referencedTable),
          referencedColumn,
        })
      }
      tables.push({
        key: key(drawn.id),
        name: drawn.table.name,
        vendor: vendorOf(drawn.style)?.id ?? null,
        columns,
        indexes: firstOfEachName(drawn.indexes.map(({ id, index }) => ({ key: key(id), ...index }))),
        references: [...references.values()],
      })
    }
  }
  // A reference to a table or a column left out as a repeated name is not a foreign key of the schema.
  const columns = new Set(tables.flatMap((table) => table.columns.map((column) => column.key)))
  for (const table of tables) table.references = table.references.filter((reference) => columns.has(reference.referencedColumn))
  return { tables, repeated: [...repeated] }
}

/** The database that the tables of the states have, when they have one; PostgreSQL otherwise. */
export function defaultDialect(...schemas: BoardSchema[]): DbVendorId {
  const vendors = new Set(schemas.flatMap((schema) => schema.tables.flatMap((table) => table.vendor ?? [])))
  return vendors.size === 1 ? [...vendors][0]! : 'postgresql'
}

/** A statement of a migration: one step written for its database. */
export interface MigrationStatement {
  /** The part of the safe order that the step belongs to, see {@link planMigration}: blank lines part them in a file. */
  phase: number
  /** Comments before the statements: a warning, what to mind, or why the database cannot take the step. */
  comments: string[]
  /** Whole statements; none when the database cannot take the step. */
  sql: string[]
  /** The step loses data, or may: a table or a column is dropped, or a type is narrowed. */
  dangerous: boolean
  unsupported: boolean
}

export interface Migration {
  dialect: SqlDialect
  /** Empty when the schemas do not differ. */
  statements: MigrationStatement[]
  /** Tables drawn more than once in either state: the migration takes the first of each. */
  repeated: string[]
}

/** Parts of the safe order: foreign keys go first and come last, drops and renames free names before creates take them. */
const PHASE = {
  dropForeignKeys: 0,
  dropKeys: 1,
  dropColumns: 2,
  dropTables: 2.1,
  renameTables: 2.2,
  renameColumns: 2.3,
  renameConstraints: 2.4,
  createTables: 3,
  addColumns: 4,
  alterColumns: 5,
  addKeys: 6,
  addForeignKeys: 7,
} as const

/** Items of two states matched: by key, then the rest by name. */
interface Matching<T> {
  pairs: [T, T][]
  removed: T[]
  added: T[]
}

function match<T extends { key: string; name: string }>(before: T[], after: T[]): Matching<T> {
  const byKey = new Map(after.map((item) => [item.key, item]))
  const taken = new Set<T>()
  const pairs: [T, T][] = []
  const rest: T[] = []
  for (const item of before) {
    const later = byKey.get(item.key)
    if (later) {
      pairs.push([item, later])
      taken.add(later)
    } else rest.push(item)
  }
  const removed: T[] = []
  for (const item of rest) {
    // A new element with the name of the old one, e.g. a table on a copy of its page, is the same table.
    const later = after.find((candidate) => !taken.has(candidate) && candidate.name === item.name)
    if (later) {
      pairs.push([item, later])
      taken.add(later)
    } else removed.push(item)
  }
  const order = new Map(after.map((item, index) => [item, index]))
  pairs.sort((a, b) => order.get(a[1])! - order.get(b[1])!)
  return { pairs, removed, added: after.filter((item) => !taken.has(item)) }
}

const encoder = new TextEncoder()
const byteLength = (text: string) => encoder.encode(text).length

/** The longest start of `text` that takes at most `limit` bytes, of whole characters. */
function clip(text: string, limit: number): string {
  let result = ''
  for (const char of text) {
    if (byteLength(result + char) > limit) break
    result += char
  }
  return result
}

/**
 * The name PostgreSQL gives a constraint without one (`makeObjectName`): `<name1>_<name2>_<label>`, where the longer of
 * the names is cut, one byte at a time, until the whole fits in `maxBytes`.
 */
export function constraintName(name1: string, name2: string | null, label: string, maxBytes: number): string {
  let [bytes1, bytes2] = [byteLength(name1), name2 === null ? 0 : byteLength(name2)]
  const available = maxBytes - (name2 === null ? 0 : 1) - byteLength(label) - 1
  while (bytes1 + bytes2 > available) {
    if (bytes1 > bytes2) bytes1--
    else bytes2--
  }
  return [clip(name1, bytes1), name2 === null ? null : clip(name2, bytes2), label].filter((part) => part !== null).join('_')
}

/** A name that `taken` does not have: `name`, or with a number after it. */
function freeName(name: string, taken: Set<string>): string {
  let free = name
  for (let number = 2; taken.has(free); number++) free = `${name}${number}`
  taken.add(free)
  return free
}

interface Rename {
  from: string
  to: string
}

/**
 * Renames in an order in which every new name is free: a rename waits for the one that takes its new name away
 * (`b → c` before `a → b`), and a cycle (`a ↔ b`) is broken by moving one name aside to `<name>_tmp`, free of `taken`.
 */
export function orderRenames<R extends Rename>(renames: R[], taken: Set<string>): R[] {
  const pending = renames.filter((rename) => rename.from !== rename.to).map((rename) => ({ ...rename }))
  const ordered: R[] = []
  while (pending.length > 0) {
    const ready = pending.findIndex((rename) => !pending.some((other) => other !== rename && other.from === rename.to))
    if (ready !== -1) {
      ordered.push(pending.splice(ready, 1)[0]!)
      continue
    }
    const first = pending[0]!
    const aside = freeName(`${first.from}_tmp`, taken)
    ordered.push({ ...first, to: aside })
    first.from = aside
  }
  return ordered
}

const definition = ({ name, type, notNull }: SchemaColumn): ColumnDefinition => ({ name, type, notNull })

/** A column with a constraint `UNIQUE` of its own: as the export of SQL writes it, not for a column of the primary key. */
const isUnique = (column: SchemaColumn) => column.unique && !column.primaryKey

const spaced = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()

/**
 * The migration from schema `from` to schema `to` for a database, in the order it takes:
 *
 * 1. foreign keys are dropped: removed ones, changed ones and those that refer to a key that is dropped;
 * 2. indexes, unique constraints and primary keys are dropped: removed and changed ones;
 * 3. columns and tables are dropped, then tables, columns, indexes and constraints renamed;
 * 4. tables are created; 5. columns added; 6. columns changed: type and `NOT NULL`;
 * 7. primary keys and unique constraints added, indexes created; 8. foreign keys added.
 *
 * Constraints have the names PostgreSQL gives those without one, `<table>_pkey`, `<table>_<column>_key` and
 * `<table>_<column>_fkey`, and follow the renames of their tables and columns.
 */
export function planMigration(from: BoardSchema, to: BoardSchema, dialect: SqlDialect): Migration {
  return {
    dialect,
    statements: new Planner(from, to, dialect).plan(),
    repeated: [...new Set([...from.repeated, ...to.repeated])],
  }
}

interface Step {
  phase: number
  operation: Operation
  warning: string | null
}

interface TablePair {
  before: SchemaTable
  after: SchemaTable
  columns: Matching<SchemaColumn>
  indexes: Matching<SchemaIndex>
}

/** A rename of a constraint or an index, by the names of both states. */
interface ConstraintRename extends Rename {
  kind: ConstraintKind
  table: string
}

/** A foreign key of a state: as a migration writes it, with the keys of its columns and its table. */
interface ForeignKey {
  definition: ForeignKeyDefinition
  column: string
  referencedColumn: string
  table: SchemaTable
}

class Planner {
  private readonly steps: Step[] = []
  private readonly from: BoardSchema
  private readonly to: BoardSchema
  private readonly dialect: SqlDialect
  private readonly tables: Matching<SchemaTable>
  private readonly pairs: TablePair[]
  /** Where each column of the earlier state is in the later one. */
  private readonly later = new Map<string, SchemaColumn>()
  /** Columns of the later state whose type changed. */
  private readonly retyped = new Set<string>()
  /** Columns of the earlier state that keys being dropped hold: foreign keys that refer to them go first. */
  private readonly unkeyed = new Set<string>()
  private readonly constraintRenames: ConstraintRename[] = []

  constructor(from: BoardSchema, to: BoardSchema, dialect: SqlDialect) {
    this.from = from
    this.to = to
    this.dialect = dialect
    this.tables = match(from.tables, to.tables)
    this.pairs = this.tables.pairs.map(([before, after]) => ({
      before,
      after,
      columns: match(before.columns, after.columns),
      indexes: match(before.indexes, after.indexes),
    }))
    for (const pair of this.pairs) {
      for (const [before, after] of pair.columns.pairs) {
        this.later.set(before.key, after)
        if (!sameType(before.type, after.type)) this.retyped.add(after.key)
      }
    }
  }

  plan(): MigrationStatement[] {
    for (const pair of this.pairs) {
      this.planColumns(pair)
      this.planPrimaryKey(pair)
      this.planUniques(pair)
      this.planIndexes(pair)
    }
    this.planRemovedTables()
    this.planAddedTables()
    this.planForeignKeys()
    this.planTableRenames()
    const taken = new Set([...this.constraintNames(this.from), ...this.constraintNames(this.to)])
    for (const rename of orderRenames(this.constraintRenames, taken)) {
      this.step(PHASE.renameConstraints, { type: 'renameConstraint', ...rename })
    }
    return this.steps
      .map((step, index) => ({ step, index }))
      .sort((a, b) => a.step.phase - b.step.phase || a.index - b.index)
      .map(({ step }) => this.statement(step))
  }

  private step(phase: number, operation: Operation, warning: string | null = null) {
    this.steps.push({ phase, operation, warning })
  }

  private statement({ phase, operation, warning }: Step): MigrationStatement {
    const rendered = this.dialect.render(operation)
    return {
      phase: Math.floor(phase),
      comments: [...(warning ? [`ВНИМАНИЕ: ${warning}`] : []), ...rendered.notes],
      sql: rendered.sql,
      dangerous: warning !== null,
      unsupported: rendered.unsupported,
    }
  }

  private name(table: string, column: string | null, label: 'pkey' | 'key' | 'fkey') {
    return constraintName(table, column, label, this.dialect.maxNameBytes)
  }

  /**
   * Names of the tables, constraints and indexes of a state, which PostgreSQL keeps in one namespace: a temporary name of
   * a rename must differ from all of them.
   */
  private constraintNames(schema: BoardSchema): string[] {
    return schema.tables.flatMap((table) => [
      table.name,
      this.name(table.name, null, 'pkey'),
      ...table.columns.flatMap((column) => [
        this.name(table.name, column.name, 'key'),
        this.name(table.name, column.name, 'fkey'),
      ]),
      ...table.indexes.map((index) => index.name),
    ])
  }

  /**
   * A constraint that stays, maybe under a new name: `done` when the database renames it or does not use its name,
   * `recreate` when it is to be dropped under the old name and added under the new one.
   */
  private renameConstraint(kind: ConstraintKind, table: string, from: string, to: string): 'recreate' | 'done' {
    if (from === to) return 'done'
    const policy = this.dialect.renames[kind]
    if (policy === 'recreate') return 'recreate'
    if (policy === 'rename') this.constraintRenames.push({ kind, table, from, to })
    return 'done'
  }

  private planColumns({ before, after, columns }: TablePair) {
    for (const column of columns.removed) {
      this.step(
        PHASE.dropColumns,
        { type: 'dropColumn', table: before.name, column: column.name },
        `столбец ${before.name}.${column.name} удаляется вместе с данными`,
      )
    }
    const renames = columns.pairs.map(([earlier, later]) => ({ from: earlier.name, to: later.name }))
    const taken = new Set([...before.columns, ...after.columns].map((column) => column.name))
    for (const rename of orderRenames(renames, taken)) {
      this.step(PHASE.renameColumns, { type: 'renameColumn', table: after.name, ...rename })
    }
    for (const column of columns.added) {
      this.step(PHASE.addColumns, { type: 'addColumn', table: after.name, column: definition(column) })
    }
    for (const [earlier, later] of columns.pairs) {
      const retyped = this.retyped.has(later.key)
      if (!retyped && earlier.notNull === later.notNull) continue
      const narrowed = retyped && !widensType(earlier.type, later.type)
      this.step(
        PHASE.alterColumns,
        { type: 'alterColumn', table: after.name, from: definition(earlier), to: definition(later), retyped },
        narrowed
          ? `тип ${after.name}.${later.name} меняется с ${earlier.type} на ${later.type}: значения могут не преобразоваться или обрезаться`
          : null,
      )
    }
  }

  private planPrimaryKey({ before, after }: TablePair) {
    const earlier = before.columns.filter((column) => column.primaryKey)
    const later = after.columns.filter((column) => column.primaryKey)
    const same =
      earlier.length === later.length &&
      earlier.every((column, index) => this.later.get(column.key)?.key === later[index]!.key) &&
      !(this.dialect.rebuildsKeysOnRetype && later.some((column) => this.retyped.has(column.key)))
    const [oldName, newName] = [this.name(before.name, null, 'pkey'), this.name(after.name, null, 'pkey')]
    if (same && (earlier.length === 0 || this.renameConstraint('primaryKey', after.name, oldName, newName) === 'done')) return
    if (earlier.length > 0) {
      this.step(PHASE.dropKeys, { type: 'dropPrimaryKey', table: before.name, name: oldName })
      earlier.forEach((column) => this.unkeyed.add(column.key))
    }
    if (later.length > 0) {
      this.step(PHASE.addKeys, {
        type: 'addPrimaryKey',
        table: after.name,
        name: newName,
        columns: later.map((column) => column.name),
      })
    }
  }

  private planUniques({ before, after, columns }: TablePair) {
    const kept = new Set<string>()
    for (const [earlier, later] of columns.pairs) {
      if (!isUnique(earlier) || !isUnique(later)) continue
      const rebuilt = this.dialect.rebuildsKeysOnRetype && this.retyped.has(later.key)
      const [oldName, newName] = [this.name(before.name, earlier.name, 'key'), this.name(after.name, later.name, 'key')]
      if (!rebuilt && this.renameConstraint('unique', after.name, oldName, newName) === 'done') kept.add(earlier.key)
    }
    for (const column of before.columns.filter((column) => isUnique(column) && !kept.has(column.key))) {
      this.step(PHASE.dropKeys, {
        type: 'dropUnique',
        table: before.name,
        name: this.name(before.name, column.name, 'key'),
        column: column.name,
      })
      this.unkeyed.add(column.key)
    }
    const keptLater = new Set([...kept].map((key) => this.later.get(key)!.key))
    for (const column of after.columns.filter((column) => isUnique(column) && !keptLater.has(column.key))) {
      this.step(PHASE.addKeys, {
        type: 'addUnique',
        table: after.name,
        name: this.name(after.name, column.name, 'key'),
        column: column.name,
      })
    }
  }

  private planIndexes({ before, after, columns, indexes }: TablePair) {
    // Columns of indexes compared by name in any case and quotes; renaming a column renames it in indexes.
    const renamed = new Map(columns.pairs.map(([earlier, later]) => [earlier.name.toLowerCase(), later.name]))
    const canonical = (name: string) => writtenName(name.toLowerCase())
    const columnsOf = (index: SchemaIndex, rename: boolean) =>
      spaced(mapIndexColumns(index.columns, (name) => canonical((rename && renamed.get(name.toLowerCase())) || name)))
    const retypedNames = new Set(
      after.columns.filter((column) => this.retyped.has(column.key)).map((column) => column.name.toLowerCase()),
    )
    const drop = (index: SchemaIndex) => {
      this.step(PHASE.dropKeys, { type: 'dropIndex', table: before.name, index })
      if (!index.unique) return
      const names = new Set(indexColumnNames(index.columns).map((name) => name.toLowerCase()))
      before.columns.filter((column) => names.has(column.name.toLowerCase())).forEach((column) => this.unkeyed.add(column.key))
    }
    const create = (index: SchemaIndex) => this.step(PHASE.addKeys, { type: 'createIndex', table: after.name, index })
    indexes.removed.forEach(drop)
    for (const [earlier, later] of indexes.pairs) {
      const same =
        columnsOf(earlier, true) === columnsOf(later, false) &&
        earlier.unique === later.unique &&
        earlier.method.toLowerCase() === later.method.toLowerCase() &&
        spaced(earlier.rest) === spaced(later.rest) &&
        !(
          this.dialect.rebuildsKeysOnRetype &&
          indexColumnNames(later.columns).some((name) => retypedNames.has(name.toLowerCase()))
        )
      if (same && this.renameConstraint('index', after.name, earlier.name, later.name) === 'done') continue
      drop(earlier)
      create(later)
    }
    indexes.added.forEach(create)
  }

  private planRemovedTables() {
    // A table goes before the tables it refers to; foreign keys in a cycle of removed tables are dropped first.
    const removed = new Set(this.tables.removed)
    const unlinked = new Set<SchemaTable>()
    const tableOf = new Map(this.from.tables.flatMap((table) => table.columns.map((column) => [column.key, table])))
    const refersTo = (table: SchemaTable, other: SchemaTable) =>
      table !== other &&
      !unlinked.has(table) &&
      table.references.some((reference) => tableOf.get(reference.referencedColumn) === other)
    while (removed.size > 0) {
      const free = [...removed].find((table) => ![...removed].some((other) => refersTo(other, table)))
      // Nothing is free in a cycle; a table whose keys are dropped refers to nothing any more.
      const next = free ?? [...removed].find((table) => !unlinked.has(table))!
      if (!free) {
        for (const reference of next.references) {
          const referenced = tableOf.get(reference.referencedColumn)
          if (referenced && referenced !== next && removed.has(referenced)) {
            this.step(PHASE.dropForeignKeys, {
              type: 'dropForeignKey',
              foreignKey: this.foreignKey(next, reference, this.from).definition,
            })
          }
        }
        unlinked.add(next)
        continue
      }
      removed.delete(next)
      this.step(PHASE.dropTables, { type: 'dropTable', table: next.name }, `таблица ${next.name} удаляется вместе с данными`)
    }
  }

  private planAddedTables() {
    for (const table of this.tables.added) {
      const keys = table.columns.filter((column) => column.primaryKey)
      const uniques = table.columns
        .filter(isUnique)
        .map((column) => ({ name: this.name(table.name, column.name, 'key'), column: column.name }))
      const foreignKeys = this.dialect.inline.foreignKeys
        ? table.references.map((reference) => this.foreignKey(table, reference, this.to).definition)
        : []
      this.step(PHASE.createTables, {
        type: 'createTable',
        table: {
          name: table.name,
          columns: table.columns.map(definition),
          primaryKey:
            keys.length > 0 ? { name: this.name(table.name, null, 'pkey'), columns: keys.map((column) => column.name) } : null,
          uniques: this.dialect.inline.uniques ? uniques : [],
          foreignKeys,
        },
      })
      if (!this.dialect.inline.uniques) {
        uniques.forEach(({ name, column }) => this.step(PHASE.addKeys, { type: 'addUnique', table: table.name, name, column }))
      }
      table.indexes.forEach((index) => this.step(PHASE.addKeys, { type: 'createIndex', table: table.name, index }))
    }
  }

  private foreignKey(table: SchemaTable, reference: SchemaReference, schema: BoardSchema): ForeignKey {
    const column = table.columns.find((candidate) => candidate.key === reference.column)!
    const referencedTable = schema.tables.find((candidate) => candidate.key === reference.referencedTable)!
    const referencedColumn = referencedTable.columns.find((candidate) => candidate.key === reference.referencedColumn)!
    return {
      definition: {
        name: this.name(table.name, column.name, 'fkey'),
        table: table.name,
        column: column.name,
        referencedTable: referencedTable.name,
        referencedColumn: referencedColumn.name,
      },
      column: column.key,
      referencedColumn: referencedColumn.key,
      table,
    }
  }

  private planForeignKeys() {
    const removedTables = new Set(this.tables.removed)
    const addedTables = new Set(this.tables.added)
    const later = new Map(
      this.to.tables.flatMap((table) =>
        table.references.map((reference) => {
          const key = this.foreignKey(table, reference, this.to)
          return [`${key.column} ${key.referencedColumn}`, key] as const
        }),
      ),
    )
    const kept = new Set<ForeignKey>()
    for (const table of this.from.tables) {
      // The keys of a dropped table go with it; those between dropped tables are dropped with them.
      if (removedTables.has(table)) continue
      for (const reference of table.references) {
        const key = this.foreignKey(table, reference, this.from)
        const [column, referenced] = [this.later.get(key.column), this.later.get(key.referencedColumn)]
        const next = column && referenced ? later.get(`${column.key} ${referenced.key}`) : undefined
        const same =
          next !== undefined &&
          !this.retyped.has(column!.key) &&
          !this.retyped.has(referenced!.key) &&
          !this.unkeyed.has(key.referencedColumn) &&
          this.renameConstraint('foreignKey', next.definition.table, key.definition.name, next.definition.name) === 'done'
        if (same) kept.add(next)
        else this.step(PHASE.dropForeignKeys, { type: 'dropForeignKey', foreignKey: key.definition })
      }
    }
    for (const key of later.values()) {
      if (kept.has(key) || (addedTables.has(key.table) && this.dialect.inline.foreignKeys)) continue
      this.step(PHASE.addForeignKeys, { type: 'addForeignKey', foreignKey: key.definition })
    }
  }

  private planTableRenames() {
    const renames = this.pairs.map(({ before, after }) => ({ from: before.name, to: after.name }))
    const taken = new Set([...this.from.tables, ...this.to.tables].map((table) => table.name))
    for (const rename of orderRenames(renames, taken)) this.step(PHASE.renameTables, { type: 'renameTable', ...rename })
  }
}
