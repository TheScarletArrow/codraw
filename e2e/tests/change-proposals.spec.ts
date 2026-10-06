import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  addShape,
  cellBox,
  center,
  createBoard,
  csrfHeaders,
  drag,
  openBoard,
  storedVertexCount,
  userPage,
  vertices,
} from './helpers.ts'

// Users of their own: the bells of the users of other tests count the notifications of those tests.
const OWNER = 'Вика'
const PROPOSER = 'Глеб'

/** The board asks for the proposals every 30 seconds, besides the message of the participant who made one. */
const POLL_TIMEOUT = 40_000

const proposals = (page: Page) => page.getByRole('complementary', { name: 'Предложения' })
const review = (page: Page) => page.getByRole('region', { name: 'Предложение «Добавить очередь»' })
const changes = (scope: Page | Locator) => scope.getByRole('complementary', { name: 'Изменения' })
const bell = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Уведомления/ })

/** Adds a rectangle `dx` to the right of the middle of the view, labels it and returns its id. */
async function labelledShape(page: Page, label: string, dx: number): Promise<string> {
  const shape = await addShape(page, 'Прямоугольник')
  const added = center(await cellBox(page, shape))
  await drag(page, added, { x: added.x + dx, y: added.y })
  await rename(page, shape, label)
  return shape
}

async function rename(page: Page, shape: string, label: string) {
  const box = await cellBox(page, shape)
  await page.mouse.dblclick(center(box).x, center(box).y)
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(label)
  await page.mouse.click(5, 400)
}

const labels = async (page: Page) => (await vertices(page)).map((cell) => cell.value).sort()

test('a viewer proposes changes in a draft, and the owner accepts them over a change of his own', async ({ browser }) => {
  test.setTimeout(2 * POLL_TIMEOUT + 60_000)
  const owner = await userPage(browser, OWNER)
  const proposer = await userPage(browser, PROPOSER)
  await proposer.request.post('/api/notifications/read-all', { headers: await csrfHeaders(proposer.request) })
  const url = await createBoard(owner)
  const boardId = new URL(url).pathname.split('/').pop()!
  await labelledShape(owner, 'API', -300)
  const db = await labelledShape(owner, 'БД', 0)
  const cache = await labelledShape(owner, 'Кэш', 300)
  // The link lets others only view the board.
  const access = await owner.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(owner.request),
  })
  expect(access.status()).toBe(200)
  // A proposal starts from the board as collab stored it.
  await expect.poll(() => storedVertexCount(boardId)).toBe(3)

  // The viewer proposes changes and lands in the draft.
  await openBoard(proposer, url)
  await expect(proposer.getByText('Только просмотр')).toBeVisible()
  await proposer.getByRole('button', { name: 'Предложения', exact: true }).click()
  await proposals(proposer).getByRole('button', { name: 'Предложить изменения' }).click()
  await proposals(proposer).getByRole('textbox', { name: 'Название предложения' }).fill('Добавить очередь')
  await proposals(proposer).getByRole('button', { name: 'Создать' }).click()
  await expect(proposer).toHaveURL(new RegExp(`/boards/${boardId}/proposals/[0-9a-f-]{36}`))
  await expect(proposer.getByRole('note')).toHaveText(
    /Предложение «Добавить очередь»: правки не попадают на доску, пока их не примут/,
  )
  await expect(proposer.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => labels(proposer)).toEqual(['API', 'БД', 'Кэш'])

  // In the draft: a new shape under «БД», and «БД» renamed. The board does not get them.
  const queue = await addShape(proposer, 'Прямоугольник')
  const added = center(await cellBox(proposer, queue))
  await drag(proposer, added, { x: added.x, y: added.y + 150 })
  await rename(proposer, queue, 'Очередь')
  await rename(proposer, db, 'PostgreSQL')
  // Meanwhile the owner changes the board.
  await rename(owner, cache, 'Redis')
  await expect.poll(() => labels(owner)).toEqual(['API', 'Redis', 'БД'])

  // The owner reviews the proposal: what it changes, on its draft.
  await owner.getByRole('button', { name: 'Предложения (1)' }).click({ timeout: POLL_TIMEOUT })
  await proposals(owner).getByRole('button', { name: /Добавить очередь/ }).click()
  await expect(changes(review(owner)).getByText('Добавлено 1 · Изменено 1 · Удалено 0')).toBeVisible()
  await expect(changes(review(owner)).getByRole('button', { name: /Изменено: PostgreSQL/ })).toBeVisible()
  await expect(changes(review(owner)).getByRole('button', { name: /Добавлено: Очередь/ })).toBeVisible()

  // Accepting merges the proposal into the board: the changes of both are there.
  await review(owner).getByRole('button', { name: 'Принять' }).click()
  await owner.getByRole('alertdialog', { name: 'Принятие предложения' }).getByRole('button', { name: 'Принять' }).click()
  await expect(review(owner)).toBeHidden()
  await expect.poll(() => labels(owner)).toEqual(['API', 'PostgreSQL', 'Redis', 'Очередь'])
  // The draft of the author is for viewing only now.
  await expect(proposer.getByRole('note')).toHaveText(/принято: черновик только для просмотра/)

  // The board as it was before is a version.
  await owner.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await owner.getByRole('menuitem', { name: 'История версий' }).click()
  await expect(
    owner.getByRole('complementary', { name: 'История версий' }).getByRole('button', { name: /Перед принятием предложения/ }),
  ).toBeVisible()

  // The author hears of it by the bell and goes to the proposal.
  await proposer.goto('/')
  await expect(bell(proposer)).toHaveAccessibleName('Уведомления (1)')
  await bell(proposer).click()
  // The newest one: earlier runs on the same database leave theirs, read.
  const notification = proposer
    .getByRole('dialog', { name: 'Уведомления' })
    .getByRole('link', { name: /Вика: ваше предложение к «Новая доска» принято/ })
    .first()
  await expect(notification).toContainText('Добавить очередь')
  await notification.click()
  await expect(review(proposer)).toContainText(/Принято: Вика/)

  await Promise.all([owner.context().close(), proposer.context().close()])
})
