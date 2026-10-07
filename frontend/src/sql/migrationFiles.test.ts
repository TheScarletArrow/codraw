import { describe, expect, it } from 'vitest'
import {
  flywayDescription,
  flywayFiles,
  isFlywayVersion,
  liquibaseChangelog,
  migrationSql,
  migrationSummary,
} from './migrationFiles.ts'
import { boardOf, plan, state, table } from './migrationTesting.ts'

const VERSION = state(table('users', 'users', { id: 'id uuid PK', mail: 'mail text', legacy: 'legacy text' }))
const BOARD = state(table('users', 'users', { id: 'id uuid PK', mail: 'email text' }))
const STATES = { from: 'версия от 7 окт., 14:30', to: 'текущая доска' }

describe('a migration as a file of SQL', () => {
  it('opens with where it goes from and to and for which database, then the statements', () => {
    expect(migrationSql(plan(VERSION, BOARD), STATES)).toBe(
      [
        '-- Миграция схемы CoDraw: версия от 7 окт., 14:30 → текущая доска',
        '-- СУБД: PostgreSQL',
        '',
        '-- ВНИМАНИЕ: столбец users.legacy удаляется вместе с данными',
        'ALTER TABLE users DROP COLUMN legacy;',
        '',
        'ALTER TABLE users RENAME COLUMN mail TO email;',
        '',
      ].join('\n'),
    )
  })

  it('names the tables drawn more than once', () => {
    const twice = boardOf(
      { id: 'p1', name: 'Схема', order: 'a0', cells: table('users', 'users', { id: 'id uuid PK' }) },
      { id: 'p2', name: 'Копия', order: 'a1', cells: table('users', 'users', { id: 'id uuid PK', name: 'name text' }) },
    )

    expect(migrationSql(plan(state(), twice), STATES)).toContain(
      '-- Таблица users нарисована несколько раз: миграция берёт первую\n',
    )
  })

  it('counts the steps, the dangerous ones and those the database cannot take', () => {
    expect(migrationSummary(plan(VERSION, BOARD))).toEqual({ changes: 2, dangerous: 1, unsupported: 0 })
    const retyped = state(table('users', 'users', { id: 'id uuid PK', mail: 'email varchar(10)', legacy: 'legacy text' }))
    expect(migrationSummary(plan(VERSION, retyped, 'sqlite'))).toEqual({ changes: 2, dangerous: 1, unsupported: 1 })
    expect(migrationSummary(plan(VERSION, VERSION))).toEqual({ changes: 0, dangerous: 0, unsupported: 0 })
  })
})

describe('a pair of Flyway', () => {
  it('has the migration in V and the migration back in U, named by the version and the description', () => {
    const [forward, backward] = flywayFiles(
      plan(VERSION, BOARD),
      plan(BOARD, VERSION),
      { version: '7', description: 'rename user email' },
      STATES,
    )

    expect(forward!.name).toBe('V7__rename_user_email.sql')
    expect(forward!.text).toContain('-- Миграция схемы CoDraw: версия от 7 окт., 14:30 → текущая доска\n')
    expect(forward!.text).toContain('ALTER TABLE users RENAME COLUMN mail TO email;')
    expect(backward!.name).toBe('U7__rename_user_email.sql')
    expect(backward!.text).toContain('-- Миграция схемы CoDraw: текущая доска → версия от 7 окт., 14:30\n')
    expect(backward!.text).toContain('ALTER TABLE users RENAME COLUMN email TO mail;')
    expect(backward!.text).toContain('ALTER TABLE users ADD COLUMN legacy text;')
  })

  it('takes versions of numbers apart by dots or underscores', () => {
    expect(['1', '2.1', '20261007_1', '1.2.3'].every(isFlywayVersion)).toBe(true)
    expect(['', 'v2', '1.', '1..2', '1 2', '1-2'].some(isFlywayVersion)).toBe(false)
  })

  it('writes the description with letters and digits only, and a default one without them', () => {
    expect(flywayDescription('  Добавить заказы: v2 ')).toBe('Добавить_заказы_v2')
    expect(flywayDescription('add__orders')).toBe('add_orders')
    expect(flywayDescription(' -- ')).toBe('update_schema')
  })
})

describe('a changeset of Liquibase', () => {
  it('is formatted SQL with the author and id, the statements and the rollback of the migration back', () => {
    expect(liquibaseChangelog(plan(VERSION, BOARD), plan(BOARD, VERSION), { author: 'alice', id: '42' }, STATES)).toBe(
      [
        '--liquibase formatted sql',
        '',
        '--changeset alice:42',
        '--comment: Миграция схемы CoDraw: версия от 7 окт., 14:30 → текущая доска (PostgreSQL)',
        '-- ВНИМАНИЕ: столбец users.legacy удаляется вместе с данными',
        'ALTER TABLE users DROP COLUMN legacy;',
        '',
        'ALTER TABLE users RENAME COLUMN mail TO email;',
        '--rollback ALTER TABLE users RENAME COLUMN email TO mail;',
        '--rollback ALTER TABLE users ADD COLUMN legacy text;',
        '',
      ].join('\n'),
    )
  })

  it('keeps the author and the id without spaces, the author without a colon', () => {
    const changelog = liquibaseChangelog(
      plan(VERSION, BOARD),
      plan(BOARD, VERSION),
      { author: ' Анна Петрова:ops ', id: 'add email ' },
      STATES,
    )
    expect(changelog).toContain('\n--changeset Анна_Петроваops:add_email\n')
    expect(liquibaseChangelog(plan(VERSION, BOARD), plan(BOARD, VERSION), { author: '', id: '' }, STATES)).toContain(
      '\n--changeset codraw:1\n',
    )
  })
})
