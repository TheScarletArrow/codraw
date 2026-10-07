import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardSnapshot } from '../diagram/diff.ts'
import { downloadBlob } from '../lib/download.ts'
import { state, table } from './migrationTesting.ts'
import { SchemaMigrationMenu, type MigrationSources } from './SchemaMigrationMenu.tsx'

vi.mock('../lib/download.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/download.ts')>()),
  downloadBlob: vi.fn(),
}))

const VERSION = state(table('users', 'users', { id: 'id uuid PK', mail: 'mail text' }))
const BOARD = state(table('users', 'users', { id: 'id uuid PK', mail: 'email text' }))

function renderMenu(read: () => MigrationSources | null = () => ({ from: VERSION, to: BOARD })) {
  const reader = vi.fn(read)
  render(<SchemaMigrationMenu read={reader} states={{ from: 'версия от 7 окт.', to: 'текущая доска' }} boardTitle="Схема" />)
  return reader
}

const menu = () => screen.getByRole('dialog', { name: 'Миграция SQL' })
const open = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Миграция SQL' }))
const textOf = (name: string) => (within(menu()).getByRole('textbox', { name: `Текст ${name}` }) as HTMLTextAreaElement).value

describe('SchemaMigrationMenu', () => {
  beforeEach(() => vi.mocked(downloadBlob).mockClear())
  afterEach(() => vi.restoreAllMocks())

  it('shows the migration of PostgreSQL as SQL, with its summary, and copies it', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderMenu()

    await open(user)

    expect(menu()).toHaveTextContent('Из «версия от 7 окт.» в «текущая доска»')
    expect(within(menu()).getByRole('combobox', { name: 'СУБД' })).toHaveValue('postgresql')
    expect(within(menu()).getByRole('radio', { name: 'SQL' })).toBeChecked()
    expect(menu()).toHaveTextContent('Изменений: 1 · опасных: 0')
    const sql = textOf('Схема — миграция.sql')
    expect(sql).toContain('-- Миграция схемы CoDraw: версия от 7 окт. → текущая доска\n-- СУБД: PostgreSQL\n')
    expect(sql).toContain('ALTER TABLE users RENAME COLUMN mail TO email;')
    expect(within(menu()).getByRole('textbox', { name: 'Текст Схема — миграция.sql' })).toHaveAttribute('readonly')

    await user.click(
      within(within(menu()).getByRole('region', { name: 'Схема — миграция.sql' })).getByRole('button', { name: 'Скопировать' }),
    )

    expect(writeText).toHaveBeenLastCalledWith(sql)
    expect(menu()).toHaveTextContent('Скопировано')
  })

  it('offers the database of the tables and writes the migration for the chosen one', async () => {
    const user = userEvent.setup()
    const oracle = (board: BoardSnapshot) => {
      const tables = structuredClone(board)
      tables.get('page-1')!.cells.get('users')!.style.dbVendor = 'oracle'
      return tables
    }
    renderMenu(() => ({ from: oracle(VERSION), to: oracle(BOARD) }))

    await open(user)
    expect(within(menu()).getByRole('combobox', { name: 'СУБД' })).toHaveValue('oracle')
    expect(textOf('Схема — миграция.sql')).toContain('-- СУБД: Oracle\n')

    await user.selectOptions(within(menu()).getByRole('combobox', { name: 'СУБД' }), 'SQL Server')

    expect(textOf('Схема — миграция.sql')).toContain("EXEC sp_rename N'users.mail', N'email', N'COLUMN';")
  })

  it('makes a pair of Flyway named by the version and the description, and downloads both files', async () => {
    const user = userEvent.setup()
    renderMenu()
    await open(user)

    await user.click(within(menu()).getByRole('radio', { name: 'Flyway' }))
    await user.clear(within(menu()).getByRole('textbox', { name: 'Версия' }))
    await user.type(within(menu()).getByRole('textbox', { name: 'Версия' }), '7')
    await user.clear(within(menu()).getByRole('textbox', { name: 'Описание' }))
    await user.type(within(menu()).getByRole('textbox', { name: 'Описание' }), 'rename user email')

    expect(textOf('V7__rename_user_email.sql')).toContain('ALTER TABLE users RENAME COLUMN mail TO email;')
    expect(textOf('U7__rename_user_email.sql')).toContain('ALTER TABLE users RENAME COLUMN email TO mail;')

    await user.click(within(menu()).getByRole('button', { name: 'Скачать оба файла' }))

    expect(vi.mocked(downloadBlob).mock.calls.map(([, name]) => name)).toEqual([
      'V7__rename_user_email.sql',
      'U7__rename_user_email.sql',
    ])
    expect(await vi.mocked(downloadBlob).mock.calls[0]![0].text()).toBe(textOf('V7__rename_user_email.sql'))
  })

  it('explains a version that Flyway would not take instead of offering files', async () => {
    const user = userEvent.setup()
    renderMenu()
    await open(user)
    await user.click(within(menu()).getByRole('radio', { name: 'Flyway' }))

    await user.clear(within(menu()).getByRole('textbox', { name: 'Версия' }))
    await user.type(within(menu()).getByRole('textbox', { name: 'Версия' }), 'v2')

    expect(within(menu()).getByRole('alert')).toHaveTextContent('Версия Flyway — числа через точку или подчёркивание')
    expect(within(menu()).getByRole('textbox', { name: 'Версия' })).toHaveAccessibleDescription(/числа через точку/)
    expect(within(menu()).queryByRole('button', { name: /Скачать/ })).toBeNull()
    expect(within(menu()).queryByRole('region')).toBeNull()
  })

  it('makes a changeset of Liquibase with the author and the id', async () => {
    const user = userEvent.setup()
    renderMenu()
    await open(user)

    await user.click(within(menu()).getByRole('radio', { name: 'Liquibase' }))
    await user.clear(within(menu()).getByRole('textbox', { name: 'Автор' }))
    await user.type(within(menu()).getByRole('textbox', { name: 'Автор' }), 'alice')
    await user.clear(within(menu()).getByRole('textbox', { name: 'ID changeset' }))
    await user.type(within(menu()).getByRole('textbox', { name: 'ID changeset' }), '42')

    const changelog = textOf('Схема — changelog.sql')
    expect(changelog).toMatch(/^--liquibase formatted sql\n\n--changeset alice:42\n/)
    expect(changelog).toContain('\n--rollback ALTER TABLE users RENAME COLUMN email TO mail;\n')
    await user.click(within(menu()).getByRole('button', { name: 'Скачать' }))
    expect(vi.mocked(downloadBlob).mock.calls.map(([, name]) => name)).toEqual(['Схема — changelog.sql'])
  })

  it('tells that the schema has not changed instead of offering an empty file', async () => {
    const user = userEvent.setup()
    renderMenu(() => ({ from: VERSION, to: VERSION }))

    await open(user)

    expect(menu()).toHaveTextContent('Схема таблиц не изменилась — миграция не нужна')
    expect(within(menu()).queryByRole('button', { name: /Скачать|Скопировать/ })).toBeNull()
  })

  it('counts the dangerous steps and those the database cannot take', async () => {
    const user = userEvent.setup()
    const after = state(table('users', 'users', { id: 'id uuid PK', mail: 'mail integer' }))
    renderMenu(() => ({ from: VERSION, to: after }))
    await open(user)

    await user.selectOptions(within(menu()).getByRole('combobox', { name: 'СУБД' }), 'SQLite')

    expect(menu()).toHaveTextContent('Изменений: 1 · опасных: 1 · SQLite не умеет: 1')
  })

  it('reads the states when it opens, and again when it opens again', async () => {
    const user = userEvent.setup()
    let board = BOARD
    const read = renderMenu(() => ({ from: VERSION, to: board }))
    expect(read).not.toHaveBeenCalled()

    await open(user)
    board = VERSION
    expect(textOf('Схема — миграция.sql')).toContain('RENAME COLUMN mail TO email')

    await user.keyboard('{Escape}')
    await open(user)

    expect(read).toHaveBeenCalledTimes(2)
    expect(menu()).toHaveTextContent('Схема таблиц не изменилась — миграция не нужна')
  })
})
