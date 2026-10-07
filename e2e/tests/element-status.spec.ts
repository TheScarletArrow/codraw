import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, csrfHeaders, openBoard, userPage, vertices } from './helpers.ts'

// Users of their own: the bells of the users of other tests count the notifications of those tests.
const OWNER = 'Вера'
const EDITOR = 'Олег'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const toReview = (page: Page) => page.getByRole('button', { name: /^\d+ на ревью$/ })
const statuses = (page: Page) => page.getByRole('dialog', { name: 'Статусы элементов' })
const bell = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Уведомления/ })
const notifications = (page: Page) => page.getByRole('dialog', { name: 'Уведомления' })

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

/** Earlier runs on the same database leave notifications: a test starts with none unread. */
async function readAll(page: Page) {
  const response = await page.request.post('/api/notifications/read-all', { headers: await csrfHeaders(page.request) })
  expect(response.status()).toBe(204)
}

test('a participant asks for a review: the owner sees the badge and «1 на ревью», goes to the element and hears of it', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const editor = await userPage(browser, EDITOR)
  await Promise.all([readAll(owner), readAll(editor)])
  const url = await createBoard(owner)
  const boardId = new URL(url).pathname.split('/').pop()!
  const renamed = await owner.request.patch(`/api/boards/${boardId}`, {
    data: { title: 'Схема ревью' },
    headers: await csrfHeaders(owner.request),
  })
  expect(renamed.status()).toBe(200)
  await openBoard(editor, url)

  // Олег draws a queue on a page of his own and marks it «Нужно ревью» from its menu.
  await editor.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(tab(editor, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  const queue = await addShape(editor, 'Прямоугольник')
  const onShape = center(await cellBox(editor, queue))
  await editor.mouse.click(onShape.x, onShape.y, { button: 'right' })
  await expect(menu(editor).getByRole('menuitemradio', { name: 'Без статуса' })).toHaveAttribute('aria-checked', 'true')
  await menu(editor).getByRole('menuitemradio', { name: 'Нужно ревью' }).click()
  await expect(editor.getByTestId('status-badge')).toHaveAccessibleName(new RegExp(`^Нужно ревью — ${EDITOR}, `))

  // Вера, on the first page, sees that one element waits for a review and goes to it.
  await expect(toReview(owner)).toHaveText('1 на ревью')
  await toReview(owner).click()
  await expect(statuses(owner).getByRole('tab', { name: 'Нужно ревью 1' })).toHaveAttribute('aria-selected', 'true')
  const item = statuses(owner).getByRole('button', { name: /Прямоугольник/ })
  await expect(item).toContainText(`Страница 2 · ${EDITOR}, только что`)
  await item.click()

  await expect(tab(owner, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => selectedIds(owner)).toEqual([queue])
  const badge = owner.getByTestId('status-badge')
  await expect(badge).toHaveAttribute('data-cell', queue)
  await expect(badge).toHaveAttribute('title', new RegExp(`^Нужно ревью — ${EDITOR}, \\d+ .+ \\d{4} г\\., \\d{2}:\\d{2}$`))

  // The owner heard of it: the notification leads to the element on its page.
  await tab(owner, 'Страница 1').click()
  await expect.poll(() => vertices(owner)).toEqual([])
  await bell(owner).click()
  const notification = notifications(owner)
    .getByRole('link', { name: new RegExp(`^${EDITOR}: запрос ревью на «Схема ревью»`) })
    .first()
  await expect(notification).toContainText('Элемент отмечен «Нужно ревью»')
  await notification.click()

  await expect(tab(owner, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => selectedIds(owner)).toEqual([queue])
  expect(new URL(owner.url()).searchParams.has('cell')).toBe(false)

  // Undo takes the status off for everybody.
  await editor.keyboard.press('Control+z')
  await expect(editor.getByTestId('status-badge')).toHaveCount(0)
  await expect(owner.getByTestId('status-badge')).toHaveCount(0)
  await expect(toReview(owner)).toHaveCount(0)

  await Promise.all([owner.context().close(), editor.context().close()])
})

test('the owner marks elements without notifying anybody, and a viewer sees the statuses without changing them', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const viewer = await userPage(browser, EDITOR)
  const url = await createBoard(owner)
  const boardId = new URL(url).pathname.split('/').pop()!
  const access = await owner.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(owner.request),
  })
  expect(access.status()).toBe(200)
  const sent: string[] = []
  owner.on('request', (request) => {
    if (request.url().endsWith('/review-requests')) sent.push(request.url())
  })

  const api = await addShape(owner, 'Прямоугольник')
  const onShape = center(await cellBox(owner, api))
  await owner.mouse.click(onShape.x, onShape.y, { button: 'right' })
  await menu(owner).getByRole('menuitemradio', { name: 'Нужно ревью' }).click()
  await expect(toReview(owner)).toHaveText('1 на ревью')

  await openBoard(viewer, url)
  await expect(viewer.getByTestId('status-badge')).toHaveAccessibleName(new RegExp(`^Нужно ревью — ${OWNER}, `))
  await expect(toReview(viewer)).toHaveText('1 на ревью')
  const onTheirs = center(await cellBox(viewer, api))
  await viewer.mouse.click(onTheirs.x, onTheirs.y, { button: 'right' })
  await expect(menu(viewer)).toBeVisible()
  await expect(menu(viewer).getByRole('menuitemradio')).toHaveCount(0)
  expect(sent).toEqual([])

  await Promise.all([owner.context().close(), viewer.context().close()])
})
