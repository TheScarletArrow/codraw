import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, createBoardViaApi, csrfHeaders, openBoard, userPage, vertices } from './helpers.ts'

/** A name of a test user of its own: test users keep the boards of earlier tests, and the list must hold only these. */
const freshName = (name: string) => `${name} ${Date.now().toString(36)}`

/** The titles of the boards in the list, in their order: own ones, then shared ones. */
const listedTitles = (page: Page) => page.locator('main a[href^="/boards/"]').allTextContents()

/** The row of a board in the list. */
const row = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('link', { name: title, exact: true }) })

const searchField = (page: Page) => page.getByRole('searchbox', { name: 'Поиск досок' })

async function renameViaApi(page: Page, boardId: string, title: string) {
  const response = await page.request.patch(`/api/boards/${boardId}`, {
    data: { title },
    headers: await csrfHeaders(page.request),
  })
  expect(response.status()).toBe(200)
}

/** Opens an item of the menu of a board in the list. */
async function menuItem(page: Page, title: string, item: 'Теги' | 'Переместить в папку') {
  await row(page, title).getByRole('button', { name: `Меню доски «${title}»` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Gives a board in the list a tag through its menu, and closes the menu. */
async function addTag(page: Page, title: string, tag: string) {
  await menuItem(page, title, 'Теги')
  const editor = page.getByRole('group', { name: `Теги доски «${title}»` })
  await editor.getByRole('textbox', { name: 'Новый тег' }).fill(tag)
  await editor.getByRole('textbox', { name: 'Новый тег' }).press('Enter')
  await expect(editor.getByRole('button', { name: `Убрать тег «${tag}»` })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row(page, title)).toContainText(`Теги: ${tag}`)
}

test('the list of boards finds a board by its title and by the text on it, with the line of the text', async ({
  browser,
}) => {
  const page = await userPage(browser, freshName('Ищущий'))
  const url = await createBoard(page)
  const boardId = new URL(url).pathname.split('/').pop()!
  await renameViaApi(page, boardId, 'Склад')
  const shape = await addShape(page, 'Прямоугольник')
  await page.mouse.dblclick(...(Object.values(center(await cellBox(page, shape))) as [number, number]))
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('Топик заказов в Kafka')
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
  await expect.poll(async () => (await vertices(page)).map((cell) => cell.value)).toEqual(['Топик заказов в Kafka'])
  await createBoardViaApi(page.request, 'Платёжный сервис')
  // collab sends the text of the board with the store of its document, a moment after the change.
  await expect
    .poll(async () => (await (await page.request.get('/api/boards/search?q=kafka')).json()) as unknown[], { timeout: 15_000 })
    .toHaveLength(1)

  await page.goto('/')
  await searchField(page).fill('ПЛАТЕЖ')
  await expect.poll(() => listedTitles(page)).toEqual(['Платёжный сервис'])

  await searchField(page).fill('kafka')
  await expect.poll(() => listedTitles(page)).toEqual(['Склад'])
  await expect(row(page, 'Склад')).toContainText('Найдено на доске: Топик заказов в Kafka')
  await expect(row(page, 'Склад').locator('mark')).toHaveText('Kafka')

  await searchField(page).fill('такого текста нет')
  await expect(page.getByText('Ничего не найдено')).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await expect.poll(() => listedTitles(page)).toHaveLength(2)

  await page.context().close()
})

test('tags and folders organize the list for their user only, and another participant does not see them', async ({
  browser,
}) => {
  const alice = await userPage(browser, freshName('Аня'))
  const bob = await userPage(browser, freshName('Боря'))
  const schema = await createBoardViaApi(alice.request, 'Схема')
  await createBoardViaApi(alice.request, 'Склад')
  // Bob opens the board through its link: it is among his shared boards.
  expect((await bob.request.get(`/api/boards/${schema}`)).status()).toBe(200)
  await alice.goto('/')

  await addTag(alice, 'Схема', 'Срочно')
  const tags = alice.getByRole('group', { name: 'Фильтр по тегам' })
  await tags.getByRole('button', { name: 'Срочно' }).click()
  await expect.poll(() => listedTitles(alice)).toEqual(['Схема'])
  await tags.getByRole('button', { name: 'Срочно' }).click()
  await expect.poll(() => listedTitles(alice)).toHaveLength(2)

  await menuItem(alice, 'Склад', 'Переместить в папку')
  await alice.getByRole('textbox', { name: 'Новая папка' }).fill('Архив')
  await alice.getByRole('textbox', { name: 'Новая папка' }).press('Enter')
  await expect(row(alice, 'Склад')).toContainText('Папка: Архив')
  const folders = alice.getByRole('group', { name: 'Папки' })
  await folders.getByRole('button', { name: 'Архив' }).click()
  await expect.poll(() => listedTitles(alice)).toEqual(['Склад'])
  await folders.getByRole('button', { name: 'Без папки' }).click()
  await expect.poll(() => listedTitles(alice)).toEqual(['Схема'])

  await bob.goto('/')
  const shared = bob.getByRole('region', { name: 'Общие со мной' })
  await expect(row(bob, 'Схема')).toBeVisible()
  await expect(shared).not.toContainText('Срочно')
  await expect(bob.getByRole('group', { name: 'Фильтр по тегам' })).toHaveCount(0)
  await addTag(bob, 'Схема', 'Моё')

  await alice.reload()
  await expect(row(alice, 'Схема')).toContainText('Теги: Срочно')
  await expect(row(alice, 'Схема')).not.toContainText('Моё')
  await bob.reload()
  await expect(row(bob, 'Схема')).toContainText('Теги: Моё')
  await expect(row(bob, 'Схема')).not.toContainText('Срочно')

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('the order of the list is chosen and kept after a reload, and boards opened lately go first', async ({ browser }) => {
  const page = await userPage(browser, freshName('Порядок'))
  await createBoardViaApi(page.request, 'Бета')
  await createBoardViaApi(page.request, 'Альфа')
  const gamma = await createBoardViaApi(page.request, 'Гамма')
  await page.goto('/')
  await expect.poll(() => listedTitles(page)).toEqual(['Гамма', 'Альфа', 'Бета'])

  await page.getByRole('combobox', { name: 'Порядок досок' }).selectOption({ label: 'По названию' })
  await expect.poll(() => listedTitles(page)).toEqual(['Альфа', 'Бета', 'Гамма'])
  await page.reload()
  await expect.poll(() => listedTitles(page)).toEqual(['Альфа', 'Бета', 'Гамма'])

  // The owner was on Гамма last: their own boards are ordered by when they were on them too.
  await openBoard(page, `/boards/${gamma}`)
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Порядок досок' }).selectOption({ label: 'Недавно открытые' })
  await expect.poll(() => listedTitles(page)).toEqual(['Гамма', 'Альфа', 'Бета'])
  await expect(row(page, 'Бета')).toContainText('Не открывалась')
  await expect(row(page, 'Гамма')).not.toContainText('Не открывалась')

  await page.context().close()
})
