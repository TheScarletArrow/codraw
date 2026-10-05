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

  await alice.getByRole('button', { name: 'SQL' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL' })
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

  await alice.getByRole('button', { name: 'SQL' }).click()
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
