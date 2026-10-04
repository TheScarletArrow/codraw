import { expect, test, type Page } from '@playwright/test'
import { env } from './env.ts'
import {
  addShape,
  cellBox,
  center,
  collabToken,
  connectToCollab,
  createBoardViaApi,
  csrfHeaders,
  drag,
  twoParticipants,
  userPage,
  vertices,
} from './helpers.ts'

type Mode = 'Только владелец' | 'Просмотр по ссылке' | 'Редактирование по ссылке'

/** Chooses who opens the board through its link in «Поделиться», as its owner. */
async function setLinkAccess(owner: Page, mode: Mode) {
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  const option = owner.getByRole('radio', { name: mode })
  await option.check()
  await expect(option).toBeChecked()
  await owner.keyboard.press('Escape')
}

test('the owner switches the board to viewing, and the page of a participant follows without a reload', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)
  const before = (await vertices(alice))[0]!

  await setLinkAccess(alice, 'Просмотр по ссылке')

  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await expect(bob.getByRole('complementary', { name: 'Фигуры' })).toHaveCount(0)
  await expect(bob.getByRole('button', { name: 'Отменить' })).toHaveCount(0)
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)
  // The viewer can neither move nor delete the shape.
  const box = await cellBox(bob, shape)
  await drag(bob, center(box), { x: center(box).x + 120, y: center(box).y + 60 })
  await bob.keyboard.press('Delete')
  await bob.waitForTimeout(500)
  expect((await vertices(alice)).map(({ x, y }) => ({ x, y }))).toEqual([{ x: before.x, y: before.y }])
  expect(await vertices(bob)).toHaveLength(1)
  // The viewer still sees the changes of the owner.
  await addShape(alice, 'Эллипс')
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)

  await setLinkAccess(alice, 'Редактирование по ссылке')

  await expect(bob.getByText('Только просмотр')).toHaveCount(0)
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await addShape(bob, 'Ромб')
  await expect.poll(async () => (await vertices(alice)).length).toBe(3)

  await close()
})

test('the owner closes the link: the participant on the board and a new visitor see «Нет доступа к доске»', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const url = alice.url()

  await setLinkAccess(alice, 'Только владелец')

  await expect(bob.getByRole('alert')).toHaveText('Нет доступа к доске')
  const carol = await userPage(browser, 'Вера')
  await carol.goto(url)
  await expect(carol.getByRole('alert')).toHaveText('Нет доступа к доске')
  // The owner keeps working on the board.
  await addShape(alice, 'Прямоугольник')
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')

  await Promise.all([close(), carol.context().close()])
})

test('collab applies no changes of a viewer, whatever the client', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const boardId = await createBoardViaApi(alice.request, 'Только смотреть')
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)
  const collabUrl = `ws://localhost:${env.collabPort}`
  const owner = await connectToCollab(collabUrl, boardId, () => collabToken(alice.request, boardId))
  const viewer = await connectToCollab(collabUrl, boardId, () => collabToken(bob.request, boardId))

  viewer.document.getMap('meta').set('viewer note', 'not applied')
  owner.document.getMap('meta').set('owner note', 'applied')

  await expect.poll(() => viewer.document.getMap('meta').get('owner note')).toBe('applied')
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(owner.document.getMap('meta').get('viewer note')).toBeUndefined()

  owner.provider.destroy()
  viewer.provider.destroy()
  await Promise.all([alice.context().close(), bob.context().close()])
})
