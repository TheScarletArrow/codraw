import { expect, test, type Page } from '@playwright/test'
import { createBoard, openBoard, userPage } from './helpers.ts'

/** The test user whom the `e2e` profile of the backend makes an administrator of the installation. */
const ADMIN = 'Админ'

/** Opens a tab of «Администрирование». */
async function openAdmin(page: Page, tab: string) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Администрирование' }).click()
  await expect(page.getByRole('heading', { name: 'Администрирование' })).toBeVisible()
  await page.getByRole('tab', { name: tab }).click()
}

test('an administrator blocks a user: their board loses its connection, they leave for the login page and sign in no more', async ({
  browser,
}) => {
  // Test users outlive the runs: every run blocks a user of its own.
  const name = `Нарушитель ${Date.now()}`
  const violator = await userPage(browser, name)
  await createBoard(violator)
  const admin = await userPage(browser, ADMIN)

  await openAdmin(admin, 'Пользователи')
  await admin.getByRole('textbox', { name: 'Имя, id или id у GitHub и Google' }).fill(name)
  await admin.getByRole('button', { name: 'Найти' }).click()
  const user = admin.getByRole('list', { name: 'Пользователи' }).getByRole('listitem').filter({ hasText: name })
  await user.getByRole('button', { name: 'Заблокировать' }).click()
  await admin.getByRole('alertdialog', { name: `Заблокировать ${name}?` }).getByRole('button', { name: 'Заблокировать' }).click()
  await expect(user).toContainText('Заблокирован(а)')

  // collab closes the connection within its check of blocked users, and the page finds the session gone.
  await expect(violator).toHaveURL(/\/login$/, { timeout: 20_000 })
  expect((await violator.request.get('/api/me')).status()).toBe(401)
  expect((await violator.request.post('/api/e2e/login', { data: { name } })).status()).toBe(403)

  await admin.getByRole('tab', { name: 'Журнал' }).click()
  await expect(admin.getByRole('table', { name: 'Журнал действий администраторов' })).toContainText(`Пользователь «${name}»`)
  await Promise.all([violator.context().close(), admin.context().close()])
})

test('a report of a reader reaches the administrator, who closes the sharing of the board to all without a sign-in', async ({
  browser,
}) => {
  const owner = await userPage(browser, 'Алиса')
  const url = await createBoard(owner)
  const boardId = url.split('/').pop()!
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  const changed = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await owner.getByRole('radio', { name: /^Все, у кого есть ссылка, без входа/ }).check()
  await changed
  await owner.keyboard.press('Escape')

  // A reader without a session reports the board.
  const message = `Реклама казино ${Date.now()}`
  const reader = await (await browser.newContext()).newPage()
  await reader.goto(`/view/${boardId}`)
  await reader.getByRole('button', { name: 'Пожаловаться' }).click()
  await reader.getByRole('radio', { name: 'Спам или реклама' }).check()
  await reader.getByRole('textbox', { name: 'Что не так' }).fill(message)
  await reader.getByRole('button', { name: 'Отправить' }).click()
  await expect(reader.getByRole('status')).toHaveText('Жалоба отправлена. Спасибо!')

  const admin = await userPage(browser, ADMIN)
  await openAdmin(admin, 'Жалобы')
  const report = admin.getByRole('list', { name: 'Открытые жалобы' }).getByRole('listitem').filter({ hasText: message })
  await expect(report).toContainText('Спам или реклама')
  await report.getByRole('button', { name: 'Сведения о доске' }).click()
  const board = admin.getByRole('region', { name: /^Доска «/ })
  await expect(board).toContainText('Все, у кого есть ссылка, без входа')
  await board.getByRole('button', { name: 'Закрыть доступ по ссылке' }).click()
  await admin.getByRole('alertdialog', { name: 'Закрыть доступ по ссылке?' }).getByRole('button', { name: 'Закрыть' }).click()
  await expect(board.getByRole('button', { name: 'Снять запрет' })).toBeVisible()
  await board.getByRole('button', { name: /^Закрыть жалобы/ }).click()
  await expect(board.getByRole('button', { name: /^Закрыть жалобы/ })).toHaveCount(0)

  // The board is shown without a sign-in no more: the reader goes to sign in, and its address answers 404.
  await reader.goto(`/view/${boardId}`)
  await expect(reader).toHaveURL(/\/login$/)
  expect((await reader.request.get(`/api/public/boards/${boardId}`)).status()).toBe(404)

  // The owner sees why and cannot open the link again.
  await owner.reload()
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  await expect(owner.getByRole('note')).toContainText('Доступ по ссылке закрыт администратором установки')
  await expect(owner.getByRole('radio', { name: /^Все, у кого есть ссылка, без входа/ })).toBeDisabled()

  await admin.getByRole('tab', { name: 'Журнал' }).click()
  const journal = admin.getByRole('table', { name: 'Журнал действий администраторов' })
  await expect(journal).toContainText('Закрыть доступ по ссылке')
  await expect(journal).toContainText('Закрыть жалобы (1)')
  await Promise.all([owner.context().close(), reader.context().close(), admin.context().close()])
})

test('an administrator deletes an account: its connection to a board of others closes, its session ends and its boards go', async ({
  browser,
}) => {
  // Test users outlive the runs: every run deletes a user of its own.
  const name = `Удаляемый ${Date.now()}`
  const user = await userPage(browser, name)
  const own = (await createBoard(user)).split('/').pop()!
  const admin = await userPage(browser, ADMIN)
  // The link of a new board lets anybody edit it: the user works on a board of the administrator.
  await openBoard(user, await createBoard(admin))

  await openAdmin(admin, 'Пользователи')
  await admin.getByRole('textbox', { name: 'Имя, id или id у GitHub и Google' }).fill(name)
  await admin.getByRole('button', { name: 'Найти' }).click()
  const row = admin.getByRole('list', { name: 'Пользователи' }).getByRole('listitem').filter({ hasText: name })
  await row.getByRole('button', { name: 'Удалить' }).click()
  await admin.getByRole('alertdialog', { name: `Удалить учётную запись ${name}?` }).getByRole('button', { name: 'Удалить навсегда' }).click()
  await expect(admin.getByText('Никого не нашлось')).toBeVisible()

  // collab closes the connection within its check of users, and the page finds the session gone.
  await expect(user).toHaveURL(/\/login$/, { timeout: 20_000 })
  expect((await user.request.get('/api/me')).status()).toBe(401)
  expect((await admin.request.get(`/api/boards/${own}`)).status()).toBe(404)
  await admin.getByRole('tab', { name: 'Журнал' }).click()
  await expect(admin.getByRole('table', { name: 'Журнал действий администраторов' })).toContainText(`Пользователь «${name}»`)
  await Promise.all([user.context().close(), admin.context().close()])
})
