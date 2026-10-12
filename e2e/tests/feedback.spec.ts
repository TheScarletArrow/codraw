import { devices, expect, test, type Page } from '@playwright/test'
import { createBoard, signIn, userPage } from './helpers.ts'

/** The test user whom the `e2e` profile of the backend makes an administrator of the installation. */
const ADMIN = 'Админ'

// A phone of Playwright without its browser: the tests run in Chromium, which emulates the screen and the touches.
const { defaultBrowserType: _phoneBrowser, ...iPhone } = devices['iPhone 14']
const PHONE = { ...iPhone, viewport: { width: 390, height: 844 } }

/** The page scrolls sideways: something is wider than the screen. */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test('feedback sent from a board reaches the administrator, who finds its author and closes it', async ({ browser }) => {
  // Test users and their feedback outlive the runs: every run sends feedback of its own.
  const name = `Отзывчивый ${Date.now()}`
  const text = `Не сохраняется подпись фигуры ${Date.now()}`
  const user = await userPage(browser, name)
  const boardId = (await createBoard(user)).split('/').pop()!

  await user.getByRole('banner').getByRole('button', { name: 'Обратная связь' }).click()
  const window = user.getByRole('dialog', { name: 'Обратная связь' })
  await expect(window).toContainText(`страница /boards/${boardId}, версия CoDraw`)
  await window.getByRole('radio', { name: 'Ошибка' }).check()
  await window.getByRole('textbox', { name: 'Сообщение' }).fill(text)
  await window.getByRole('button', { name: 'Отправить' }).click()
  await expect(window.getByRole('status')).toHaveText('Спасибо! Отзыв отправлен.')

  const admin = await userPage(browser, ADMIN)
  await admin.goto('/')
  await admin.getByRole('link', { name: 'Администрирование' }).click()
  await admin.getByRole('tab', { name: 'Отзывы' }).click()
  const open = admin.getByRole('list', { name: 'Открытые отзывы' }).getByRole('listitem').filter({ hasText: text })
  await expect(open).toContainText('Ошибка')
  await expect(open).toContainText(name)
  await expect(open).toContainText(`Страница /boards/${boardId}`)
  await expect(open).toContainText('браузер Mozilla/5.0')
  await open.getByRole('button', { name: 'Закрыть' }).click()
  await expect(open).toHaveCount(0)

  await admin.getByRole('radio', { name: 'Закрытые' }).check()
  const closed = admin.getByRole('list', { name: 'Закрытые отзывы' }).getByRole('listitem').filter({ hasText: text })
  await expect(closed).toContainText(`, ${ADMIN}`)
  await closed.getByRole('button', { name }).click()
  await expect(admin.getByRole('tab', { name: 'Пользователи' })).toHaveAttribute('aria-selected', 'true')
  await expect(admin.getByRole('list', { name: 'Пользователи' })).toContainText(name)

  await admin.getByRole('tab', { name: 'Журнал' }).click()
  const journal = admin.getByRole('table', { name: 'Журнал действий администраторов' })
  await expect(journal).toContainText('Закрыть отзыв')
  await expect(journal).toContainText(`Отзыв «${text}»`)
  await Promise.all([user.context().close(), admin.context().close()])
})

test('on a phone «Тема» opens the window of feedback, which fits the screen below the header', async ({ browser }) => {
  const context = await browser.newContext(PHONE)
  await signIn(context.request, `Телефон ${Date.now()}`)
  const page = await context.newPage()
  await createBoard(page)
  expect(await overflow(page)).toBe(0)
  // The header of a phone has no room for the button.
  await expect(page.getByRole('banner').getByRole('button', { name: 'Обратная связь' })).toBeHidden()

  await page.getByRole('button', { name: /^Тема:/ }).tap()
  await page.getByRole('dialog', { name: 'Тема' }).getByRole('button', { name: 'Обратная связь' }).tap()

  const window = page.getByRole('dialog', { name: 'Обратная связь' })
  await expect(window).toBeVisible()
  const box = (await window.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.viewport.width)
  expect(box.y).toBeGreaterThanOrEqual(48)
  await window.getByRole('textbox', { name: 'Сообщение' }).fill('Удобно смотреть доску с телефона')
  await window.getByRole('button', { name: 'Отправить' }).tap()
  await expect(window.getByRole('status')).toHaveText('Спасибо! Отзыв отправлен.')
  expect(await overflow(page)).toBe(0)
  await context.close()
})
