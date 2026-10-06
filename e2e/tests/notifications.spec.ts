import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, csrfHeaders, openBoard, openBoardList, userPage } from './helpers.ts'

// Users of their own: the bells of the users of other tests count the notifications of those tests.
const AUTHOR = 'Зоя'
const READER = 'Илья'
const OWNER = 'Тимур'
const REQUESTER = 'Ульяна'

/** The header asks for the number of unread notifications every 30 seconds. */
const POLL_TIMEOUT = 40_000

const bell = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Уведомления/ })
const notifications = (page: Page) => page.getByRole('dialog', { name: 'Уведомления' })
const panel = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const sharing = (page: Page) => page.getByRole('dialog', { name: 'Поделиться доской' })

/** Earlier runs on the same database leave notifications: a test starts with none unread. */
async function readAll(page: Page) {
  const response = await page.request.post('/api/notifications/read-all', { headers: await csrfHeaders(page.request) })
  expect(response.status()).toBe(204)
}

/** Changes the board of the signed-in owner through the API. */
async function changeBoard(page: Page, url: string, changes: { title?: string; linkAccess?: string }) {
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await page.request.patch(`/api/boards/${boardId}`, { data: changes, headers: await csrfHeaders(page.request) })
  expect(response.status()).toBe(200)
}

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

test('a mention reaches the bell of the participant, who lands on the thread and answers, and the author reads all', async ({
  browser,
}) => {
  // Two waits for the next request of the number.
  test.setTimeout(2 * POLL_TIMEOUT + 30_000)
  const author = await userPage(browser, AUTHOR)
  const reader = await userPage(browser, READER)
  await Promise.all([readAll(author), readAll(reader)])
  const url = await createBoard(author)
  await changeBoard(author, url, { title: 'Схема БД' })
  // Илья opens the board through its link, which makes him a participant to mention, and goes back to his boards.
  await openBoard(reader, url)
  await openBoardList(reader)
  await expect(bell(reader)).toHaveAccessibleName('Уведомления')

  // Зоя comments on a shape and mentions Илья.
  const shape = await addShape(author, 'Прямоугольник')
  const box = await cellBox(author, shape)
  await author.mouse.click(center(box).x, center(box).y, { button: 'right' })
  await author.getByRole('menu', { name: 'Действия' }).getByRole('menuitem', { name: 'Комментировать' }).click()
  const field = panel(author).getByRole('combobox', { name: 'Новый комментарий' })
  await field.pressSequentially('@Ил')
  await author.getByRole('option', { name: READER }).click()
  await field.pressSequentially('посмотри схему')
  await field.press('Enter')
  await expect(panel(author).getByRole('group', { name: 'Новая ветка' })).toBeHidden()

  // The bell of Илья on the list of boards counts the mention, which leads to the thread at its shape.
  await expect(bell(reader)).toHaveAccessibleName('Уведомления (1)', { timeout: POLL_TIMEOUT })
  await bell(reader).click()
  // Earlier runs on the same database leave older notifications below: the newest is first.
  const mention = notifications(reader).getByRole('link', { name: new RegExp(`^${AUTHOR}: упоминание в «Схема БД»`) }).first()
  await expect(mention).toContainText(`@${READER} посмотри схему`)
  await mention.click()

  await expect(reader.getByRole('status')).toHaveText('Синхронизировано')
  const thread = panel(reader).getByRole('article')
  await expect(thread).toHaveAttribute('aria-current', 'true')
  await expect(thread).toContainText('посмотри схему')
  await expect.poll(() => selectedIds(reader)).toEqual([shape])
  await expect(bell(reader)).toHaveAccessibleName('Уведомления')
  expect(new URL(reader.url()).searchParams.has('thread')).toBe(false)

  // Илья answers, and Зоя, who started the thread, hears of it on the board.
  const answer = thread.getByRole('combobox', { name: 'Ответ' })
  await answer.fill('Посмотрел, всё верно')
  await answer.press('Enter')
  await expect(thread.getByRole('listitem')).toHaveCount(2)
  await expect(bell(author)).toHaveAccessibleName('Уведомления (1)', { timeout: POLL_TIMEOUT })
  await bell(author).click()
  const reply = notifications(author).getByRole('link', { name: new RegExp(`^${READER}: ответ в ветке на «Схема БД»`) }).first()
  await expect(reply).toContainText('Посмотрел, всё верно')
  await expect(reply).toContainText('Не прочитано')

  // «Прочитать все» takes the number away.
  await notifications(author).getByRole('button', { name: 'Прочитать все' }).click()
  await expect(bell(author)).toHaveAccessibleName('Уведомления')
  await expect(reply).not.toContainText('Не прочитано')

  await Promise.all([author.context().close(), reader.context().close()])
})

test('a request for access leads the owner to «Поделиться», and the refusal reaches the user without the board', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const requester = await userPage(browser, REQUESTER)
  await Promise.all([readAll(owner), readAll(requester)])
  const url = await createBoard(owner)
  await changeBoard(owner, url, { title: 'Тайный проект', linkAccess: 'none' })

  // Ульяна asks for editing on «Нет доступа».
  await requester.goto(url)
  const form = requester.getByRole('form', { name: 'Запрос доступа' })
  await form.getByRole('radio', { name: 'Редактирование' }).check()
  await form.getByRole('button', { name: 'Запросить доступ' }).click()
  await expect(requester.getByRole('heading', { name: 'Запрос отправлен' })).toBeVisible()

  // Тимур on the list of boards: the notification opens «Поделиться» on the board with the request.
  await openBoardList(owner)
  await expect(bell(owner)).toHaveAccessibleName('Уведомления (1)')
  await bell(owner).click()
  const request = notifications(owner)
    .getByRole('link', { name: new RegExp(`^${REQUESTER}: запрос доступа к «Тайный проект»`) })
    .first()
  await expect(request).toContainText('Просит редактирование')
  await request.click()
  const asking = sharing(owner).getByRole('region', { name: 'Запросы доступа' }).getByRole('listitem', { name: REQUESTER })
  await expect(asking).toContainText('Просит редактирование')
  await asking.getByRole('button', { name: 'Отклонить' }).click()
  await expect(sharing(owner).getByRole('region', { name: 'Запросы доступа' })).toHaveCount(0)

  // Ульяна has left the page meanwhile and learns of the refusal from her bell, without the board or its owner.
  await openBoardList(requester)
  await expect(bell(requester)).toHaveAccessibleName('Уведомления (1)')
  await bell(requester).click()
  const refusal = notifications(requester).getByRole('link', { name: /^Отказ в доступе Доска недоступна/ }).first()
  await expect(refusal).not.toContainText('Тайный проект')
  await expect(refusal).not.toContainText(OWNER)
  await refusal.click()
  await expect(requester.getByRole('alert')).toHaveText('Нет доступа: владелец закрыл доступ к доске по ссылке')
  await expect(requester.getByRole('form', { name: 'Запрос доступа' })).toBeVisible()

  await Promise.all([owner.context().close(), requester.context().close()])
})
