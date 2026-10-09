import { expect, test, type Page } from '@playwright/test'
import { edges, twoParticipants, vertices } from './helpers.ts'

const DDL =
  'CREATE TABLE users (\n  id uuid PRIMARY KEY,\n  email text NOT NULL,\n  deleted_at timestamptz\n);\n' +
  'CREATE VIEW active_users AS SELECT u.id, u.email FROM users u WHERE u.deleted_at IS NULL;\n'

/** Selects a cell through the editor the app exposes on the canvas element. */
const select = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    graph.setSelectionCell(graph.getDataModel().getCell(id))
  }, id)

/** The fields of a table or a view. */
const fieldsOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return graph
      .getDataModel()
      .getCell(id)
      .getChildren()
      .map((field: any) => field.getValue())
  }, id)

test('DDL with a view becomes a view that reads its table, its query reaches the other participant and goes back to SQL', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu.getByRole('textbox', { name: 'DDL' }).fill(DDL)
  await expect(menu.getByRole('status')).toHaveText('Таблиц: 1, представлений: 1, связей: 0, индексов: 0, пропущено операторов: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value).sort()).toEqual(['active_users', 'users'])
  const view = (await vertices(bob)).find((cell) => cell.value === 'active_users')!
  const table = (await vertices(bob)).find((cell) => cell.value === 'users')!
  expect(view.style).toMatchObject({ codrawView: true, codrawViewQuery: 'SELECT u.id, u.email FROM users u WHERE u.deleted_at IS NULL' })
  expect(await fieldsOf(bob, view.id)).toEqual(['id uuid', 'email text'])
  expect((await edges(bob)).map((edge) => [edge.source, edge.target, edge.style.dashed])).toEqual([[view.id, table.id, true]])

  await select(alice, view.id)
  await expect(alice.getByRole('button', { name: 'Представление', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await alice.getByRole('button', { name: 'Материализованное' }).click()
  await alice.getByRole('button', { name: 'Запрос…' }).click()
  const query = alice.getByRole('textbox', { name: 'Запрос' })
  await query.fill('SELECT id, email FROM users WHERE deleted_at IS NULL;')
  await query.press('Control+Enter')
  await expect(query).toBeHidden()

  await expect
    .poll(async () => (await vertices(bob)).find((cell) => cell.id === view.id)?.style)
    .toMatchObject({ codrawViewMaterialized: true, codrawViewQuery: 'SELECT id, email FROM users WHERE deleted_at IS NULL' })

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  await expect(menu).toContainText('Таблиц на странице: 1, представлений: 1')
  await menu.getByRole('button', { name: 'Скопировать SQL' }).click()
  await expect(menu).toContainText('SQL скопирован')
  const sql = await alice.evaluate(() => navigator.clipboard.readText())
  expect(sql).toContain('CREATE TABLE users (')
  expect(sql).toContain('CREATE MATERIALIZED VIEW active_users AS SELECT id, email FROM users WHERE deleted_at IS NULL;')

  await close()
})
