import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, connect, createBoard, drag, edges, userPage, vertices } from './helpers.ts'

const tabNames = (page: Page) =>
  page
    .getByRole('tablist', { name: 'Страницы' })
    .getByRole('tab')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))

/** Saves the board through «Сохранить в .codraw» and returns the saved file and its name. */
async function saveBoard(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить в .codraw' }).click()
  const file = await download
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) }
}

test('a board saved as .codraw opens as the same board from the list', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const client = await addShape(alice, 'Прямоугольник')
  const server = await addShape(alice, 'Эллипс')
  const box = await cellBox(alice, server)
  await drag(alice, { x: box.x + 15, y: box.y + 15 }, { x: box.x + 215, y: box.y + 15 })
  await connect(alice, client, server)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)
  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect.poll(async () => (await vertices(alice)).length).toBe(0)
  await addShape(alice, 'Таблица')

  const { name, bytes } = await saveBoard(alice)

  expect(name).toBe('Новая доска.codraw')
  // A ZIP archive, which draw.io does not open.
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from('PK\x03\x04', 'latin1'))

  const eve = await userPage(browser, 'Ева')
  await eve.goto('/')
  await eve.getByLabel('Файл CoDraw или draw.io').setInputFiles({ name, mimeType: 'application/vnd.codraw.board+zip', buffer: bytes })

  await expect(eve.getByRole('heading', { name: 'Новая доска', level: 2 })).toBeVisible()
  await expect(eve.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => tabNames(eve)).toEqual(['Страница 1', 'Страница 2'])
  await expect.poll(async () => (await vertices(eve)).map((cell) => cell.id).sort()).toEqual([client, server].sort())
  expect((await edges(eve)).map(({ source, target }) => ({ source, target }))).toEqual([{ source: client, target: server }])

  await Promise.all([alice.context().close(), eve.context().close()])
})

test('a .codraw file is imported into a board, and a damaged one is refused', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const shape = await addShape(alice, 'Прямоугольник')
  const { name, bytes } = await saveBoard(alice)
  const input = alice.getByLabel('Файл CoDraw или draw.io')

  await input.setInputFiles({ name, mimeType: 'application/vnd.codraw.board+zip', buffer: bytes })

  await expect.poll(() => tabNames(alice)).toEqual(['Страница 1', 'Страница 1'])
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.id)).toEqual([shape])

  const damaged = Buffer.from(bytes)
  damaged.fill(0, 40, 60)
  await input.setInputFiles({ name, mimeType: 'application/vnd.codraw.board+zip', buffer: damaged })

  await expect(alice.getByRole('alert')).toHaveText('Файл .codraw повреждён')
  expect(await tabNames(alice)).toEqual(['Страница 1', 'Страница 1'])

  await alice.context().close()
})
