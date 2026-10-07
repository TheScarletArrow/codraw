import { expect, test, type Page } from '@playwright/test'
import { addShape, twoParticipants, vertices } from './helpers.ts'

/** Selects a table, or its row at `row`, through the editor the app exposes on the canvas element. */
const select = (page: Page, id: string, row: number | null) =>
  page.evaluate(
    ([id, row]) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const { graph } = container.__codrawEditor
      const table = graph.getDataModel().getCell(id)
      graph.setSelectionCell(row === null ? table : table.getChildAt(row))
    },
    [id, row] as const,
  )

/** The text of each row of a table, and whether it is an index. */
const rowsOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return graph
      .getDataModel()
      .getCell(id)
      .getChildren()
      .filter((cell: any) => cell.isVertex())
      .map((row: any) => [row.getValue(), Boolean(row.getStyle().codrawIndex)])
  }, id)

async function clickEmptyCanvas(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

test('an index added to a table reaches the other participant with its columns and uniqueness', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const users = await addShape(alice, 'Таблица')
  await select(alice, users, null)
  await alice.getByRole('button', { name: 'Добавить индекс' }).click()
  await alice.keyboard.type('users_id_idx (id)')
  await clickEmptyCanvas(alice)

  await expect.poll(() => rowsOf(bob, users)).toEqual([
    ['id uuid PK', false],
    ['users_id_idx (id)', true],
  ])

  await select(alice, users, 1)
  const panel = alice.getByRole('group', { name: 'Свойства индекса' })
  await expect(panel.getByRole('textbox', { name: 'Столбцы индекса' })).toHaveValue('id')
  await panel.getByRole('button', { name: 'UNIQUE' }).click()

  await expect.poll(() => rowsOf(bob, users)).toEqual([
    ['id uuid PK', false],
    ['users_id_idx (id) UNIQUE', true],
  ])
  await close()
})

const MEMBERS = `CREATE TABLE members (
  board_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE UNIQUE INDEX members_board_user_idx ON members (board_id, user_id);
CREATE INDEX members_user_idx ON members (user_id);
`

test('indexes of imported SQL become rows of their table for the other participant', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu
    .getByLabel('Файлы SQL')
    .setInputFiles({ name: 'members.sql', mimeType: 'text/plain', buffer: Buffer.from(MEMBERS) })
  await expect(menu.getByRole('status')).toHaveText('Таблиц: 1, связей: 0, индексов: 2, пропущено операторов: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value)).toEqual(['members'])
  const [members] = await vertices(bob)
  expect(await rowsOf(bob, members!.id)).toEqual([
    ['board_id uuid NOT NULL', false],
    ['user_id uuid NOT NULL', false],
    ['role text NOT NULL', false],
    ['members_board_user_idx (board_id, user_id) UNIQUE', true],
    ['members_user_idx (user_id)', true],
  ])
  await close()
})
