import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { createBoard, edges, twoParticipants, userPage, vertices } from './helpers.ts'
import { env } from './env.ts'

/** A dump of pg_dump 18 that the unit tests of the frontend read too. */
const PG_DUMP = fileURLToPath(new URL('../../frontend/src/sql/fixtures/pg_dump-18-schema-only.sql', import.meta.url))

test('a dump of pg_dump opened in «Импорт SQL» becomes tables with their references and the view for everybody', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await expect(menu).toContainText('Схему готовой базы снимает pg_dump --schema-only или mysqldump --no-data')
  await menu.getByLabel('Файлы SQL').setInputFiles(PG_DUMP)
  // The partition is no table; the type, the function and the trigger are skipped, the rest of the dump is not.
  await expect(menu.getByRole('status')).toHaveText('Таблиц: 6, представлений: 1, связей: 4, индексов: 3, пропущено операторов: 3')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect
    .poll(async () => (await vertices(bob)).map((cell) => cell.value).sort())
    .toEqual(['active_orders', 'audit_log', 'measurements', 'order_items', 'orders', 'products', 'users'])
  // The references, and the dashed edge from the view to the orders it reads.
  await expect.poll(async () => (await edges(bob)).length).toBe(5)
  expect((await edges(bob)).filter((edge) => edge.style.dashed)).toHaveLength(1)
  const users = await bob.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const table = graph.getDefaultParent().getChildren().find((cell: any) => cell.getValue() === 'users')
    return table.getChildren().map((cell: any) => cell.getValue())
  })
  expect(users).toEqual([
    'id bigserial PK',
    'email text NOT NULL UNIQUE',
    'name character varying(100)',
    'created_at timestamp with time zone NOT NULL',
    'users_email_lower_idx (lower(email)) UNIQUE USING btree',
  ])

  await close()
})

test('«Подключиться к базе…» reads the schema of a live database into «Импорт SQL»', async ({ browser }) => {
  // The e2e profile of the backend allows `localhost`, where the database of the tests runs.
  const database = new URL(env.databaseUrl.replace(/^jdbc:/, ''))
  const page = await userPage(browser, 'Дина')
  await createBoard(page)

  await page.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = page.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu.getByRole('button', { name: 'Подключиться к базе…' }).click()
  await menu
    .getByRole('textbox', { name: 'Строка подключения' })
    .fill(`postgresql://${env.databaseUser}@localhost:${database.port || 5432}${database.pathname}?sslmode=disable&connect_timeout=3`)
  await expect(menu.getByRole('textbox', { name: 'Хост' })).toHaveValue('localhost')
  await expect(menu.getByRole('combobox', { name: 'SSL' })).toHaveValue('disable')
  await menu.getByLabel('Пароль').fill(env.databasePassword)
  await menu.getByRole('button', { name: 'Загрузить схему' }).click()

  const ddl = menu.getByRole('textbox', { name: 'DDL' })
  await expect(ddl).toHaveValue(/^-- Schema public of PostgreSQL /)
  await expect(ddl).toHaveValue(/CREATE TABLE boards \(/)
  await expect(menu.getByLabel('Пароль')).toHaveCount(0)
  await expect(menu.getByRole('status')).toHaveText(/^Таблиц: \d+, связей: [1-9]\d*, индексов: \d+, пропущено операторов: 0$/)
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(page)).map((cell) => cell.value)).toEqual(expect.arrayContaining(['boards', 'users', 'comments']))
  expect((await edges(page)).length).toBeGreaterThan(0)

  // The privacy policy of an installation with the connection on says what happens to the password.
  await page.goto('/privacy')
  await expect(page.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toContainText('Подключение к базе данных.')

  await page.context().close()
})
