import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, csrfHeaders, openBoard, twoParticipants, userPage, vertices } from './helpers.ts'

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const searchBar = (page: Page) => page.getByRole('search', { name: 'Поиск на доске' })
const searchField = (page: Page) => page.getByRole('searchbox', { name: 'Найти на доске' })

/** The texts of the selected elements of the canvas. */
const selected = (page: Page) =>
  page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: any) => String(cell.getValue() ?? ''))
  })

/** Whether the middle of a cell is in the visible part of the canvas. */
async function inView(page: Page, id: string) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  const middle = center(await cellBox(page, id))
  return middle.x > canvas.x && middle.x < canvas.x + canvas.width && middle.y > canvas.y && middle.y < canvas.y + canvas.height
}

/** The id of the field of a table with this text. */
const fieldId = (page: Page, table: string, text: string) =>
  page.evaluate(
    ([table, text]) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const { graph } = container.__codrawEditor
      return graph
        .getDataModel()
        .getCell(table)
        .getChildren()
        .find((cell: any) => cell.getValue() === text)
        .getId() as string
    },
    [table, text] as const,
  )

async function clickEmptyCanvas(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

/**
 * «Customer API» on the first page and the table with the field `customer_id uuid` on the second, made by `page`, which
 * stays on the second page with the field selected.
 */
async function fillBoard(page: Page) {
  const api = await addShape(page, 'Прямоугольник')
  await page.mouse.dblclick(...(Object.values(center(await cellBox(page, api))) as [number, number]))
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('Customer API')
  await clickEmptyCanvas(page)
  await expect.poll(async () => (await vertices(page)).map((cell) => cell.value)).toEqual(['Customer API'])

  await page.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(tab(page, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  const orders = await addShape(page, 'Таблица')
  await page.getByRole('button', { name: 'Добавить поле' }).click()
  await page.keyboard.type('customer_id uuid')
  // The field stays selected, and «Добавить поле» adds the next one after it.
  await page.keyboard.press('Enter')
  return { api, orders }
}

test('Ctrl+F finds a shape and a field of a table on two pages, goes to them and follows changes of others', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const { api, orders } = await fillBoard(alice)
  await expect(tab(bob, 'Страница 2')).toBeVisible()

  await bob.keyboard.press('ControlOrMeta+f')
  await expect(searchField(bob)).toBeFocused()
  await bob.keyboard.type('customer')

  await expect(searchBar(bob)).toContainText('1 из 2')
  await expect.poll(() => selected(bob)).toEqual(['Customer API'])
  // Keys typed in the field are not keys of the canvas: Backspace takes a letter, not the selected shape.
  await bob.keyboard.press('Backspace')
  await expect(searchField(bob)).toHaveValue('custome')
  expect((await vertices(bob)).map((cell) => cell.id)).toEqual([api])
  await bob.keyboard.type('r')

  await bob.keyboard.press('Enter')

  await expect(tab(bob, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  await expect(searchBar(bob)).toContainText('2 из 2')
  await expect.poll(() => selected(bob)).toEqual(['customer_id uuid'])
  const field = await fieldId(bob, orders, 'customer_id uuid')
  expect(await inView(bob, field)).toBe(true)

  await bob.keyboard.press('Shift+Enter')

  await expect(tab(bob, 'Страница 1')).toHaveAttribute('aria-selected', 'true')
  await expect(searchBar(bob)).toContainText('1 из 2')
  await expect.poll(() => selected(bob)).toEqual(['Customer API'])

  // Another participant adds a field that matches: the current match stays.
  await alice.getByRole('button', { name: 'Добавить поле' }).click()
  await alice.keyboard.type('customer_name text')
  await alice.keyboard.press('Enter')
  await expect(searchBar(bob)).toContainText('1 из 3')

  await bob.keyboard.press('Escape')

  await expect(searchBar(bob)).toBeHidden()
  await expect(bob.getByTestId('diagram-canvas')).toBeFocused()
  expect(await selected(bob)).toEqual(['Customer API'])

  await close()
})

test('a participant who may only view searches the board too', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)
  await fillBoard(alice)

  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await bob.keyboard.press('ControlOrMeta+f')
  await bob.keyboard.type('customer_id')

  await expect(searchBar(bob)).toContainText('1 из 1')
  await expect(tab(bob, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => selected(bob)).toEqual(['customer_id uuid'])

  await Promise.all([alice.context().close(), bob.context().close()])
})
