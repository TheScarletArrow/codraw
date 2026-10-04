import { expect, test } from '@playwright/test'
import { env } from './env.ts'
import {
  addShape,
  collabToken,
  connectToCollab,
  createBoard,
  createBoardViaApi,
  csrfHeaders,
  userPage,
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

test('a board of another user is available neither through the API nor through sync', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const boardUrl = await createBoard(alice)
  const boardId = boardUrl.split('/').pop()!
  await addShape(alice, 'Прямоугольник')

  // API: the board looks like a missing one.
  expect((await bob.request.get(`/api/boards/${boardId}`)).status()).toBe(404)
  const tokenResponse = await bob.request.post(`/api/boards/${boardId}/collab-token`, {
    headers: await csrfHeaders(bob.request),
  })
  expect(tokenResponse.status()).toBe(404)
  const bobBoards = (await (await bob.request.get('/api/boards')).json()) as { id: string }[]
  expect(bobBoards.map((board) => board.id)).not.toContain(boardId)

  // The app: opening the link shows that there is no such board.
  await bob.goto(boardUrl)
  await expect(bob.getByRole('alert')).toHaveText('Доска не найдена')

  // Sync: neither without a token nor with a token for an own board.
  const collabUrl = `ws://localhost:${env.collabPort}`
  await expect(connectToCollab(collabUrl, boardId, '')).rejects.toThrow('permission-denied')
  const bobBoard = await createBoardViaApi(bob.request, 'Доска Боба')
  const bobToken = await collabToken(bob.request, bobBoard)
  await expect(connectToCollab(collabUrl, boardId, bobToken)).rejects.toThrow('permission-denied')

  await Promise.all([alice.context().close(), bob.context().close()])
})
