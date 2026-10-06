import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, openBoard, userPage, vertices } from './helpers.ts'

// Users of their own: other tests expect Алиса and Боб to have the members and the requests of their own boards only.
const OWNER = 'Дина'
const REQUESTER = 'Егор'
const VIEWER = 'Жанна'

/** The page without access asks for the board every 10 seconds: an answer of the owner shows within that. */
const ANSWER_TIMEOUT = 20_000

const palette = (page: Page) => page.getByRole('complementary', { name: 'Фигуры' })
const sharing = (page: Page) => page.getByRole('dialog', { name: 'Поделиться доской' })
const requestsOf = (page: Page) => sharing(page).getByRole('region', { name: 'Запросы доступа' })

/** Opens «Поделиться» and waits for the participants of the board. */
async function openSharing(page: Page) {
  await page.getByRole('button', { name: 'Поделиться' }).click()
  await expect(sharing(page).getByRole('list', { name: 'Участники доски' })).toBeVisible()
}

/** The owner chooses what the link to the board gives, on its page. */
async function setLinkAccess(page: Page, label: RegExp) {
  await openSharing(page)
  const changed = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await sharing(page).getByRole('radio', { name: label }).check()
  await changed
  await page.keyboard.press('Escape')
}

test('a user without access asks to edit the board, the owner gives editing, and the board opens for them', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const requester = await userPage(browser, REQUESTER)
  const url = await createBoard(owner)
  await setLinkAccess(owner, /Только я/)

  // «Нет доступа» asks the owner for editing, with a message.
  await requester.goto(url)
  await expect(requester.getByRole('alert')).toHaveText('Нет доступа: владелец закрыл доступ к доске по ссылке')
  const form = requester.getByRole('form', { name: 'Запрос доступа' })
  await form.getByRole('radio', { name: 'Редактирование' }).check()
  await form.getByRole('textbox', { name: 'Сообщение владельцу' }).fill('Нужно поправить схему БД')
  await form.getByRole('button', { name: 'Запросить доступ' }).click()
  await expect(requester.getByRole('heading', { name: 'Запрос отправлен' })).toBeVisible()
  await expect(requester.getByRole('button', { name: 'Отменить запрос' })).toBeVisible()

  // The owner opens the board: «Поделиться» counts the request, and its window shows it.
  await owner.reload()
  await owner.getByRole('button', { name: 'Поделиться (1 запрос доступа)' }).click()
  const request = requestsOf(owner).getByRole('listitem', { name: REQUESTER })
  await expect(request).toContainText('Просит редактирование')
  await expect(request).toContainText('Нужно поправить схему БД')
  await request.getByRole('button', { name: 'Дать редактирование' }).click()

  await expect(sharing(owner).getByRole('combobox', { name: `Роль: ${REQUESTER}` })).toHaveValue('editor')
  await expect(requestsOf(owner)).toHaveCount(0)
  await expect(owner.getByRole('button', { name: 'Поделиться', exact: true })).toBeVisible()
  await owner.keyboard.press('Escape')

  // The page of the requester opens the board by itself, and they edit it together with the owner.
  await expect(requester.getByRole('status')).toHaveText('Синхронизировано', { timeout: ANSWER_TIMEOUT })
  await expect(palette(requester)).toBeVisible()
  await addShape(requester, 'Прямоугольник')
  await expect.poll(async () => (await vertices(owner)).length).toBe(1)

  await Promise.all([owner.context().close(), requester.context().close()])
})

test('a viewer asks to edit the board, and the owner declines', async ({ browser }) => {
  const owner = await userPage(browser, OWNER)
  const viewer = await userPage(browser, VIEWER)
  const url = await createBoard(owner)
  await setLinkAccess(owner, /Просмотр/)

  // Next to «Только просмотр» the viewer asks for editing.
  await openBoard(viewer, url)
  await expect(viewer.getByText('Только просмотр')).toBeVisible()
  await viewer.getByRole('button', { name: 'Запросить правку' }).click()
  const dialog = viewer.getByRole('dialog', { name: 'Запрос правки' })
  await dialog.getByRole('textbox', { name: 'Сообщение владельцу' }).fill('Хочу поправить связи')
  await dialog.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(viewer.getByRole('button', { name: 'Запрос отправлен' })).toBeVisible()
  await viewer.keyboard.press('Escape')

  // The window «Поделиться» asks for the requests as it opens, and the owner declines.
  await openSharing(owner)
  const request = requestsOf(owner).getByRole('listitem', { name: VIEWER })
  await expect(request).toContainText('Просит редактирование')
  await expect(request).toContainText('Хочу поправить связи')
  await request.getByRole('button', { name: 'Отклонить' }).click()
  await expect(requestsOf(owner)).toHaveCount(0)

  // The viewer learns it and stays a viewer.
  await expect(viewer.getByRole('button', { name: 'Запрос отклонён' })).toBeVisible({ timeout: ANSWER_TIMEOUT })
  await expect(viewer.getByText('Только просмотр')).toBeVisible()
  await expect(palette(viewer)).toBeHidden()

  await Promise.all([owner.context().close(), viewer.context().close()])
})
