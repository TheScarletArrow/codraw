import type { Migration, MigrationStatement } from './migration.ts'
import type { SqlFile } from './parseSql.ts'
import { sqlMessages } from './messages.ts'

/** Files of a migration: plain SQL, a pair of Flyway, or a changeset of Liquibase in formatted SQL. */

export type MigrationFormat = 'sql' | 'flyway' | 'liquibase'

/** Where a migration goes from and to, as people call the states, e.g. «версия от 7 окт.» and «текущая доска». */
export interface MigrationStates {
  from: string
  to: string
}

/** What a migration does, for its summary. */
export interface MigrationSummary {
  /** Steps of the migration, those the database cannot take too. */
  changes: number
  /** Steps that lose data or may: dropped tables and columns, narrowed types. */
  dangerous: number
  /** Steps the database cannot take, written as comments. */
  unsupported: number
}

export function migrationSummary({ statements }: Migration): MigrationSummary {
  return {
    changes: statements.length,
    dangerous: statements.filter((statement) => statement.dangerous).length,
    unsupported: statements.filter((statement) => statement.unsupported).length,
  }
}

const title = ({ from, to }: MigrationStates) => sqlMessages.migrationTitle(from, to)

/** The comment that opens a file: where the migration goes from and to, the database, and tables drawn more than once. */
function header(migration: Migration, states: MigrationStates): string[] {
  return [
    `-- ${title(states)}`,
    `-- ${sqlMessages.database(migration.dialect.label)}`,
    ...migration.repeated.map((name) => `-- ${sqlMessages.repeatedTable(name)}`),
  ]
}

const block = (statement: MigrationStatement) =>
  [...statement.comments.map((comment) => `-- ${comment}`), ...statement.sql].join('\n')

/**
 * The statements of a migration: its parts of the safe order apart by a blank line, and so is a statement of several
 * lines from the next one.
 */
export function migrationBody({ statements }: Migration): string {
  const parts: string[] = []
  let previous: { phase: number; text: string } | null = null
  for (const statement of statements) {
    const text = block(statement)
    const apart = previous !== null && (previous.phase !== statement.phase || previous.text.includes('\n') || text.includes('\n'))
    parts.push(previous === null ? text : `${apart ? '\n\n' : '\n'}${text}`)
    previous = { phase: statement.phase, text }
  }
  return parts.join('')
}

/** A migration as one file of SQL. */
export function migrationSql(migration: Migration, states: MigrationStates): string {
  return `${header(migration, states).join('\n')}\n\n${migrationBody(migration)}\n`
}

/** A version of Flyway: numbers apart by dots or underscores, e.g. `2`, `2.1` or `20261007_1`. */
export function isFlywayVersion(version: string): boolean {
  return /^\d+(?:[._]\d+)*$/.test(version)
}

/** The description of a migration of Flyway in its file name: letters and digits, `_` for the rest. */
export function flywayDescription(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'update_schema'
}

/**
 * The pair of Flyway, as the migrations of this project go: `V<version>__<description>.sql` with the migration and
 * `U<version>__<description>.sql` with the migration back, `backward`. The version must be one, see
 * {@link isFlywayVersion}.
 */
export function flywayFiles(
  forward: Migration,
  backward: Migration,
  { version, description }: { version: string; description: string },
  states: MigrationStates,
): SqlFile[] {
  const name = `${version}__${flywayDescription(description)}.sql`
  return [
    { name: `V${name}`, text: migrationSql(forward, states) },
    { name: `U${name}`, text: migrationSql(backward, { from: states.to, to: states.from }) },
  ]
}

/** An author or an id of a changeset without spaces: Liquibase reads `--changeset author:id` up to a space. */
const changesetPart = (text: string, fallback: string) => text.trim().replace(/\s+/g, '_') || fallback

/**
 * A changelog of Liquibase in formatted SQL with one changeset: the statements of the migration, and those of the
 * migration back, `backward`, as its rollback.
 */
export function liquibaseChangelog(
  forward: Migration,
  backward: Migration,
  { author, id }: { author: string; id: string },
  states: MigrationStates,
): string {
  const rollback = migrationBody(backward)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `--rollback ${line}`)
  return [
    '--liquibase formatted sql',
    '',
    // The author ends at the first colon.
    `--changeset ${changesetPart(author.replaceAll(':', ''), 'codraw')}:${changesetPart(id, '1')}`,
    `--comment: ${title(states)} (${forward.dialect.label})`,
    ...forward.repeated.map((name) => `-- ${sqlMessages.repeatedTable(name)}`),
    migrationBody(forward),
    ...rollback,
    '',
  ].join('\n')
}
