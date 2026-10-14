import { expect, test, type Page } from '@playwright/test'
import { addShape, twoParticipants, vertices } from './helpers.ts'

/** Selects a cell through the editor the app exposes on the canvas element. */
const select = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    graph.setSelectionCell(graph.getDataModel().getCell(id))
  }, id)

/** The comment of a table and where its first row starts. */
const commentOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const table = container.__codrawEditor.graph.getDataModel().getCell(id)
    return { comment: table.getStyle().codrawTableComment ?? null, firstRow: table.getChildAt(0).getGeometry().y }
  }, id)

async function clickEmptyCanvas(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

test('a comment typed on the toolbar lies under the name of the table for the other participant, and goes with undo', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const table = await addShape(alice, 'Таблица')
  await expect.poll(() => commentOf(bob, table)).toEqual({ comment: null, firstRow: 30 })

  await select(alice, table)
  const comment = alice.getByRole('textbox', { name: 'Комментарий таблицы' })
  await comment.fill('Клиенты магазина')
  await comment.press('Enter')

  // The header is taller by the line of the comment, and the field starts under it.
  await expect.poll(() => commentOf(bob, table)).toEqual({ comment: 'Клиенты магазина', firstRow: 46 })

  await clickEmptyCanvas(alice)
  await alice.keyboard.press('Control+z')
  await expect.poll(() => commentOf(bob, table)).toEqual({ comment: null, firstRow: 30 })
  await close()
})

const DDL = `CREATE TABLE accounts (id uuid PRIMARY KEY, email text NOT NULL);
COMMENT ON TABLE accounts IS 'Клиенты магазина';
COMMENT ON COLUMN accounts.email IS 'Почта';
`

test('the comment of imported SQL reaches the other participant and goes back to SQL', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu.getByRole('textbox', { name: 'DDL' }).fill(DDL)
  await expect(menu.getByRole('status')).toHaveText('Таблиц: 1, связей: 0, индексов: 0, пропущено операторов: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.style.codrawTableComment)).toEqual(['Клиенты магазина'])

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  await menu.getByRole('button', { name: 'Скопировать SQL' }).click()
  await expect(menu).toContainText('SQL скопирован')
  const sql = await alice.evaluate(() => navigator.clipboard.readText())
  expect(sql).toContain("NOT NULL\n);\nCOMMENT ON TABLE accounts IS 'Клиенты магазина';")
  await close()
})
