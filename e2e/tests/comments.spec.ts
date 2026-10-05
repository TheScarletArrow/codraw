import { expect, test, type Page } from '@playwright/test'
import {
  addShape,
  cellBox,
  center,
  createBoard,
  csrfHeaders,
  drag,
  openBoard,
  twoParticipants,
  userPage,
} from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const thread = (page: Page, target: string) => panel(page).getByRole('article', { name: `Ветка: ${target}` })

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

/** Adds a shape with a label, `dx` to the right of the middle of the view, and returns its id. */
async function labelledShape(page: Page, label: string, dx = 0): Promise<string> {
  const shape = await addShape(page, 'Прямоугольник')
  if (dx !== 0) {
    const added = center(await cellBox(page, shape))
    await drag(page, added, { x: added.x + dx, y: added.y })
  }
  const box = await cellBox(page, shape)
  await page.mouse.dblclick(center(box).x, center(box).y)
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.type(label)
  await page.mouse.click(5, 400)
  return shape
}

/** Starts a thread about the shape from its menu and sends the first comment. */
async function commentOn(page: Page, shape: string, text: string) {
  const box = await cellBox(page, shape)
  await page.mouse.click(center(box).x, center(box).y, { button: 'right' })
  await page.getByRole('menu', { name: 'Действия' }).getByRole('menuitem', { name: 'Комментировать' }).click()
  const field = panel(page).getByRole('combobox', { name: 'Новый комментарий' })
  await expect(field).toBeFocused()
  await field.fill(text)
  await field.press('Enter')
  await expect(panel(page).getByRole('group', { name: 'Новая ветка' })).toBeHidden()
}

test('a comment on a shape reaches the other participant, who answers with a mention, and the thread is resolved', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const api = await labelledShape(alice, 'API')

  await commentOn(alice, api, 'Почему без кэша?')

  // Боб sees the count, the badge of the shape and the thread, without reloading.
  await expect(bob.getByRole('button', { name: 'Комментарии (1)' })).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Комментарии к элементу: 1' })).toBeVisible()
  await bob.getByRole('button', { name: 'Комментарии к элементу: 1' }).click()
  await expect(thread(bob, '«API»')).toContainText('Почему без кэша?')
  await expect(thread(bob, '«API»')).toContainText('Алиса')

  const answer = thread(bob, '«API»').getByRole('combobox', { name: 'Ответ' })
  await answer.pressSequentially('@Ал')
  await bob.getByRole('option', { name: 'Алиса' }).click()
  await answer.pressSequentially('кэш будет в следующем релизе')
  await answer.press('Enter')

  // Алиса gets the answer with herself mentioned, also among the threads that mention her.
  await expect(thread(alice, '«API»').getByRole('listitem')).toHaveCount(2)
  await expect(thread(alice, '«API»').locator('[data-mention]')).toHaveText('@Алиса')
  await panel(alice).getByRole('button', { name: 'Упоминают меня' }).click()
  await expect(thread(alice, '«API»')).toContainText('кэш будет в следующем релизе')

  await thread(alice, '«API»').getByRole('button', { name: 'Решено' }).click()

  await expect(bob.getByRole('button', { name: 'Комментарии', exact: true })).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Комментарии к элементу: 1' })).toBeHidden()
  await panel(bob).getByRole('button', { name: 'Решённые' }).click()
  await expect(thread(bob, '«API»')).toContainText('Решено: Алиса')

  await close()
})

test('the thread of a deleted shape stays, and a click on a thread brings its shape into view', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const api = await labelledShape(alice, 'API')
  // To the left: the panel of comments covers the right of the canvas.
  const database = await labelledShape(alice, 'База', -250)
  await commentOn(alice, api, 'Про API')
  await commentOn(alice, database, 'Про базу')

  await alice.mouse.click(5, 400)
  await thread(alice, '«API»').getByRole('button', { name: '«API»' }).click()
  await expect.poll(() => selectedIds(alice)).toEqual([api])

  const box = await cellBox(alice, database)
  await alice.mouse.click(center(box).x, center(box).y, { button: 'right' })
  await alice.getByRole('menu', { name: 'Действия' }).getByRole('menuitem', { name: 'Удалить' }).click()

  await expect(thread(alice, 'Элемент удалён')).toContainText('Про базу')
  await expect(alice.getByRole('button', { name: /Комментарии к элементу/ })).toHaveCount(1)

  await alice.context().close()
})

test('a participant who may only view comments on a shape', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const api = await labelledShape(alice, 'API')
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)
  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()

  await commentOn(bob, api, 'Здесь опечатка')

  await expect(alice.getByRole('button', { name: 'Комментарии (1)' })).toBeVisible()
  await alice.getByRole('button', { name: 'Комментарии (1)' }).click()
  await expect(thread(alice, '«API»')).toContainText('Здесь опечатка')
  await expect(thread(alice, '«API»')).toContainText('Боб')

  await Promise.all([alice.context().close(), bob.context().close()])
})
