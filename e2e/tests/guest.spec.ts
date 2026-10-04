import { expect, test } from '@playwright/test'
import { createBoard, openBoard, userPage } from './helpers.ts'

test('a visitor works as a guest, keeps the boards after closing the browser and opens boards by their links', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const aliceBoard = await createBoard(alice)

  const context = await browser.newContext()
  const guest = await context.newPage()
  await guest.goto('/')
  await guest.getByRole('button', { name: 'Продолжить без входа' }).click()
  const header = guest.getByRole('banner')
  await expect(header).toContainText(/Гость \d{1,3}/)
  await expect(header.getByRole('link', { name: 'Войти' })).toBeVisible()
  const boardPath = new URL(await createBoard(guest)).pathname
  await expect(guest.getByRole('list', { name: 'Участники' })).toHaveText(/^Гость \d{1,3} \(вы\)$/)

  // The guest session cookie is persistent, so a browser restart keeps it.
  const session = (await context.cookies()).find((cookie) => cookie.name === 'SESSION')!
  expect(session.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 60 * 60)
  const storageState = await context.storageState()
  await context.close()
  const reopened = await (await browser.newContext({ storageState })).newPage()
  await reopened.goto('/')
  await expect(reopened.locator(`a[href="${boardPath}"]`)).toHaveText('Новая доска')

  await openBoard(reopened, aliceBoard)
  await expect(reopened.getByRole('heading', { name: 'Новая доска' })).toBeVisible()

  await Promise.all([alice.context().close(), reopened.context().close()])
})
