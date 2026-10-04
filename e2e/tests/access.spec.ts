import { expect, test } from '@playwright/test'
import { env } from './env.ts'
import {
  addShape,
  collabToken,
  connectToCollab,
  createBoard,
  createBoardViaApi,
  csrfHeaders,
  openBoard,
  userPage,
  vertices,
} from './helpers.ts'

test('a visitor without a session is sent to the login page', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('link', { name: 'Войти через GitHub' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible()
})

test('the signed-in user sees their name and can sign out', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await page.goto('/')
  await expect(page.getByRole('banner')).toContainText('Алиса')

  await page.getByRole('button', { name: 'Выйти' }).click()

  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/me')).status()).toBe(401)
  await page.context().close()
})

test('another user opens a board through its link and edits it together with the owner', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const boardUrl = await createBoard(alice)
  const boardId = boardUrl.split('/').pop()!

  await openBoard(bob, boardUrl)
  await addShape(bob, 'Прямоугольник')

  await expect.poll(async () => (await vertices(alice)).length).toBe(1)
  // The board stays in the list of its owner only.
  await bob.goto('/')
  await expect(bob.getByText('Досок пока нет')).toBeVisible()
  await alice.goto('/')
  await expect(alice.locator(`a[href="/boards/${boardId}"]`)).toBeVisible()

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('a board is reachable neither without a session nor through sync without a token for it', async ({
  browser,
  playwright,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const boardId = await createBoardViaApi(alice.request, 'Доска Алисы')
  const anonymous = await playwright.request.newContext({ baseURL: env.frontendUrl })

  expect((await anonymous.get(`/api/boards/${boardId}`)).status()).toBe(401)
  expect((await anonymous.post(`/api/boards/${boardId}/collab-token`, { headers: await csrfHeaders(anonymous) })).status()).toBe(401)

  const collabUrl = `ws://localhost:${env.collabPort}`
  await expect(connectToCollab(collabUrl, boardId, '')).rejects.toThrow('permission-denied')
  const otherBoard = await createBoardViaApi(alice.request, 'Другая доска')
  const tokenForOtherBoard = await collabToken(alice.request, otherBoard)
  await expect(connectToCollab(collabUrl, boardId, tokenForOtherBoard)).rejects.toThrow('permission-denied')

  await Promise.all([alice.context().close(), anonymous.dispose()])
})
