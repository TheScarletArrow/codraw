import { expect, test, type Page } from '@playwright/test'
import { env } from './env.ts'
import {
  addShape,
  collabToken,
  connectToCollab,
  createBoard,
  openBoard,
  openBoardList,
  userPage,
  vertices,
} from './helpers.ts'

/** Chooses what the link to the board gives in the «Поделиться» window of its owner. */
async function setLinkAccess(owner: Page, access: 'Только я' | 'Просмотр' | 'Редактирование') {
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  const option = owner.getByRole('radio', { name: new RegExp(access) })
  const changed = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await option.check()
  await changed
  await expect(option).toBeChecked()
  await owner.keyboard.press('Escape')
}

/** Алиса has a board, and Боб has it open through its link. */
async function sharedBoard(browser: Parameters<typeof userPage>[0]) {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await openBoard(bob, url)
  return {
    alice,
    bob,
    boardId: url.split('/').pop()!,
    close: () => Promise.all([alice.context().close(), bob.context().close()]),
  }
}

const palette = (page: Page) => page.getByRole('complementary', { name: 'Фигуры' })

test('a link for viewing takes editing from the participant at once, and sync rejects their changes', async ({ browser }) => {
  const { alice, bob, boardId, close } = await sharedBoard(browser)
  await expect(palette(bob)).toBeVisible()

  await setLinkAccess(alice, 'Просмотр')

  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await expect(palette(bob)).toBeHidden()
  await expect(bob.getByRole('button', { name: 'Добавить страницу' })).toBeHidden()
  await expect(bob.getByRole('button', { name: 'Импорт из .drawio' })).toBeHidden()
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')

  // The participant still sees the changes of the owner.
  await addShape(alice, 'Прямоугольник')
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)

  // A client of their own with their token cannot change the document either.
  const collabUrl = `ws://localhost:${env.collabPort}`
  const watcher = await connectToCollab(collabUrl, boardId, await collabToken(alice.request, boardId))
  const intruder = await connectToCollab(collabUrl, boardId, await collabToken(bob.request, boardId))
  intruder.document.getMap('meta').set('intruder', true)
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(watcher.document.getMap('meta').get('intruder')).toBeUndefined()
  watcher.provider.destroy()
  intruder.provider.destroy()

  await close()
})

test('closing the link shows the participant «Нет доступа», and an editable link lets them back', async ({ browser }) => {
  const { alice, bob, boardId, close } = await sharedBoard(browser)

  await setLinkAccess(alice, 'Только я')

  await expect(bob.getByRole('alert')).toHaveText('Нет доступа: владелец закрыл доступ к доске по ссылке')
  await bob.reload()
  await expect(bob.getByRole('alert')).toHaveText('Нет доступа: владелец закрыл доступ к доске по ссылке')
  expect(await openBoardList(bob)).not.toContain(boardId)
  await expect(bob.locator(`a[href="/boards/${boardId}"]`)).toHaveCount(0)

  await setLinkAccess(alice, 'Редактирование')
  await bob.goBack()
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await addShape(bob, 'Эллипс')
  await expect.poll(async () => (await vertices(alice)).length).toBe(1)

  await close()
})

test('a link for viewing that becomes editable gives the participant editing without reloading', async ({ browser }) => {
  const { alice, bob, close } = await sharedBoard(browser)
  await setLinkAccess(alice, 'Просмотр')
  await expect(bob.getByText('Только просмотр')).toBeVisible()

  await setLinkAccess(alice, 'Редактирование')

  await expect(bob.getByText('Только просмотр')).toBeHidden()
  await expect(palette(bob)).toBeVisible()
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await addShape(bob, 'Ромб')
  await expect.poll(async () => (await vertices(alice)).length).toBe(1)

  await close()
})

test('«Поделиться» copies the link to the board on the current page', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: env.frontendUrl })
  await createBoard(alice)

  await alice.getByRole('button', { name: 'Поделиться' }).click()
  await alice.getByRole('button', { name: 'Копировать' }).click()

  await expect(alice.getByRole('button', { name: 'Скопировано' })).toBeVisible()
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(alice.url())
  await alice.context().close()
})
