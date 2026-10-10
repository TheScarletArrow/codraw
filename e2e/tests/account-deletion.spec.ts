import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addShape, createBoard, createBoardViaApi, csrfHeaders, openBoard, signIn, userPage } from './helpers.ts'

// Users of their own: the account of the first one goes, and the second gets a board of hers.
const LEAVING = 'Дана'
const MEMBER = 'Ефим'

test('a user downloads her data, gives a shared board to its member and deletes her account; her comment stays without her', async ({
  browser,
}) => {
  const dana = await userPage(browser, LEAVING)
  const efim = await userPage(browser, MEMBER)
  const efimId = ((await (await efim.request.get('/api/me')).json()) as { id: string }).id

  // Her board, which Efim edits as its member.
  const url = await createBoard(dana)
  const boardId = url.split('/').pop()!
  await addShape(dana, 'Прямоугольник')
  await openBoard(efim, url)
  const member = await dana.request.put(`/api/boards/${boardId}/members/${efimId}`, {
    data: { role: 'editor' },
    headers: await csrfHeaders(dana.request),
  })
  expect(member.ok()).toBe(true)

  // Her comment on a board of Efim.
  const efimsBoard = await createBoardViaApi(efim.request, 'Доска Ефима')
  const thread = await dana.request.post(`/api/boards/${efimsBoard}/threads`, {
    data: { pageId: 'page-1', body: 'Комментарий Даны' },
    headers: await csrfHeaders(dana.request),
  })
  expect(thread.status()).toBe(201)

  // «Скачать мои данные» saves an archive with her profile, her board as .drawio and her comment.
  await dana.goto('/')
  await dana.getByRole('link', { name: 'Учётная запись' }).click()
  await expect(dana.getByRole('heading', { name: 'Учётная запись', level: 1 })).toBeVisible()
  const downloading = dana.waitForEvent('download')
  await dana.getByRole('button', { name: 'Скачать мои данные' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^codraw-data-\d{4}-\d{2}-\d{2}\.zip$/)
  const archive = await readFile((await download.path())!)
  for (const name of ['profile.json', 'comments.json', 'boards/Новая доска.drawio']) {
    expect(archive.includes(Buffer.from(name))).toBe(true)
  }
  expect(archive.includes(Buffer.from('Комментарий Даны'))).toBe(true)
  expect(archive.includes(Buffer.from('<mxfile'))).toBe(true)

  // The board that Efim works on needs a decision before the account goes.
  await dana.getByLabel('Чтобы подтвердить, введите слово «удалить»').fill('удалить')
  const remove = dana.getByRole('button', { name: 'Удалить учётную запись' })
  await expect(remove).toBeDisabled()
  await dana.getByLabel('Новая доска').selectOption(`Передать: ${MEMBER}`)
  await remove.click()
  await expect(dana.getByRole('status')).toHaveText(/Учётная запись удалена/)
  await expect(dana).toHaveURL(/\/login$/)

  // The board is Efim's now, and her comment stays as written by a deleted user.
  const boards = (await (await efim.request.get('/api/boards')).json()) as { id: string }[]
  expect(boards.map((board) => board.id)).toContain(boardId)
  await efim.goto(`/boards/${efimsBoard}`)
  await efim.getByRole('button', { name: 'Комментарии' }).click()
  await expect(efim.getByRole('listitem', { name: 'Комментарий: Удалённый пользователь' })).toContainText('Комментарий Даны')

  // Signing in again gives her a new empty account.
  await signIn(dana.request, LEAVING)
  expect(await (await dana.request.get('/api/boards')).json()).toEqual([])

  await Promise.all([dana.context().close(), efim.context().close()])
})
