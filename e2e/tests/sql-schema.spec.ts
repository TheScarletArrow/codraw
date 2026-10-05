import { expect, test } from '@playwright/test'
import { cells, twoParticipants, vertices } from './helpers.ts'

const USERS = 'CREATE TABLE users (\n  id uuid PRIMARY KEY,\n  email text NOT NULL UNIQUE\n);\nCREATE INDEX users_email_idx ON users (email);\n'
const BOARDS = 'CREATE TABLE boards (\n  id uuid PRIMARY KEY,\n  owner_id uuid NOT NULL REFERENCES users (id)\n);\n'
const TITLE = 'ALTER TABLE boards ADD COLUMN title text NOT NULL;\n'

test('migrations of Flyway become tables with their reference for everybody, are undone in one step and go back to SQL', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu.getByLabel('Файлы SQL').setInputFiles([
    { name: 'V3__title.sql', mimeType: 'text/plain', buffer: Buffer.from(TITLE) },
    { name: 'V2__boards.sql', mimeType: 'text/plain', buffer: Buffer.from(BOARDS) },
    { name: 'V1__users.sql', mimeType: 'text/plain', buffer: Buffer.from(USERS) },
  ])
  await expect(menu.getByRole('status')).toHaveText('Таблиц: 2, связей: 1, пропущено операторов: 1')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value).sort()).toEqual(['boards', 'users'])
  // Fields are children of the tables, and the reference connects two fields.
  const fields = await bob.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const children = graph.getDefaultParent().getChildren()
    return {
      boards: children.find((cell: any) => cell.getValue() === 'boards').getChildren().map((cell: any) => cell.getValue()),
      edges: children
        .filter((cell: any) => cell.isEdge())
        .map((edge: any) => [edge.getTerminal(true).getValue(), edge.getTerminal(false).getValue()]),
    }
  })
  expect(fields.boards).toEqual(['id uuid PK', 'owner_id uuid FK NOT NULL', 'title text NOT NULL'])
  expect(fields.edges).toEqual([['owner_id uuid FK NOT NULL', 'id uuid PK']])

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  await expect(menu).toContainText('Таблиц на странице: 2')
  await menu.getByRole('button', { name: 'Скопировать SQL' }).click()
  await expect(menu).toContainText('SQL скопирован')
  const sql = await alice.evaluate(() => navigator.clipboard.readText())
  expect(sql).toContain('CREATE TABLE users (\n    id uuid PRIMARY KEY,\n    email text NOT NULL UNIQUE\n);')
  expect(sql).toContain('ALTER TABLE boards ADD FOREIGN KEY (owner_id) REFERENCES users (id);')
  await alice.keyboard.press('Escape')

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('a field shows its type, nullability and reference in columns, and the toolbar sets them for everybody', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu.getByLabel('Файлы SQL').setInputFiles([
    { name: 'V1__users.sql', mimeType: 'text/plain', buffer: Buffer.from(USERS) },
    { name: 'V2__boards.sql', mimeType: 'text/plain', buffer: Buffer.from(BOARDS) },
  ])
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  // The columns, the reference and the badge of the database are drawn on the canvas of the other participant.
  const bobCanvas = bob.getByTestId('diagram-canvas')
  await expect(bobCanvas.locator('text', { hasText: '→ users.id' })).toHaveCount(1)
  await expect(bobCanvas.locator('text', { hasText: /^PG$/ })).toHaveCount(2)

  const select = (page: typeof alice, table: string, field: number | null) =>
    page.evaluate(
      ([table, field]) => {
        const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
        const { graph } = container.__codrawEditor
        const cell = graph.getDefaultParent().getChildren().find((cell: any) => cell.getValue() === table)
        graph.setSelectionCell(field === null ? cell : cell.getChildAt(field))
      },
      [table, field] as const,
    )
  const fieldsOf = (page: typeof alice, table: string) =>
    page.evaluate((table) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const { graph } = container.__codrawEditor
      const cell = graph.getDefaultParent().getChildren().find((cell: any) => cell.getValue() === table)
      return cell.getChildren().map((field: any) => field.getValue())
    }, table)

  await select(alice, 'boards', 1)
  await alice.getByRole('combobox', { name: 'Тип поля' }).fill('bigint')
  await alice.getByRole('combobox', { name: 'Тип поля' }).press('Enter')
  await alice.getByRole('button', { name: 'NULL', exact: true }).click()
  await expect.poll(() => fieldsOf(bob, 'boards')).toEqual(['id uuid PK', 'owner_id bigint FK'])
  await expect(bobCanvas.locator('text', { hasText: /^bigint$/ })).toHaveCount(1)

  await select(alice, 'users', null)
  await alice.getByRole('combobox', { name: 'СУБД таблицы' }).selectOption('Oracle')
  await expect(bobCanvas.locator('text', { hasText: /^ORA$/ })).toHaveCount(1)

  await close()
})
