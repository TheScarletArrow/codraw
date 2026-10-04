import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, connect, createBoard, drag, edges, twoParticipants, userPage, vertices } from './helpers.ts'

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const tabNames = (page: Page) =>
  page
    .getByRole('tablist', { name: 'Страницы' })
    .getByRole('tab')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))

/** Exports the board through the button and returns the saved file and its name. */
async function exportBoard(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  return { name: file.suggestedFilename(), xml: await readFile((await file.path())!, 'utf8') }
}

test('a board is exported with all its pages and opens again as a new board from the list', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const client = await addShape(alice, 'Прямоугольник')
  const server = await addShape(alice, 'Эллипс')
  const box = await cellBox(alice, server)
  await drag(alice, { x: box.x + 15, y: box.y + 15 }, { x: box.x + 215, y: box.y + 15 })
  await connect(alice, client, server)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)
  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await addShape(alice, 'Таблица')

  const { name, xml } = await exportBoard(alice)

  expect(name).toBe('Новая доска.drawio')
  expect(Array.from(xml.matchAll(/<diagram [^>]*name="([^"]+)"/g), (match) => match[1])).toEqual(['Страница 1', 'Страница 2'])
  expect(xml).toContain(`<mxCell id="${client}"`)
  expect(xml).toContain('edgeStyle=orthogonalEdgeStyle;')
  expect(xml).toContain('childLayout=stackLayout;')

  // The exported file opens as a board with the same content. Another test expects Bob to own no boards.
  const bob = await userPage(browser, 'Ева')
  await bob.goto('/')
  await bob.getByLabel('Файл draw.io').setInputFiles({ name, mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(bob.getByRole('heading', { name: 'Новая доска', level: 2 })).toBeVisible()
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Страница 2'])
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id).sort()).toEqual([client, server].sort())
  expect((await edges(bob)).map(({ source, target }) => ({ source, target }))).toEqual([{ source: client, target: server }])

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('a compressed draw.io file is imported into a board, and the other participant sees its pages', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await addShape(alice, 'Прямоугольник')

  await alice.getByLabel('Файл draw.io').setInputFiles(fixture('payments.drawio'))

  await expect.poll(() => tabNames(alice)).toEqual(['Страница 1', 'Контекст', 'Схема БД'])
  await expect(tab(alice, 'Контекст')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['API\nGateway', 'Payments DB'])
  const gateway = (await vertices(alice)).find((cell) => cell.id === 'gateway')!
  expect(gateway).toMatchObject({ x: 40, y: 80, width: 120, height: 60, style: { rounded: true, fillColor: '#dae8fc' } })
  expect((await edges(alice)).map(({ source, target }) => ({ source, target }))).toEqual([{ source: 'gateway', target: 'payments-db' }])

  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Контекст', 'Схема БД'])
  await tab(bob, 'Схема БД').click()
  // The cells of the second layer are on the page too.
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value)).toEqual(['payments', 'Сумма в копейках'])

  await close()
})

test('a draw.io file opens as a new board named after the file', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await page.goto('/')

  await page.getByLabel('Файл draw.io').setInputFiles(fixture('payments.drawio'))

  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}\?page=payments-context$/)
  await expect(page.getByRole('heading', { name: 'payments', level: 2 })).toBeVisible()
  await expect.poll(() => tabNames(page)).toEqual(['Контекст', 'Схема БД'])
  const boardPath = new URL(page.url()).pathname
  await page.goto('/')
  await expect(page.locator(`a[href="${boardPath}"]`)).toHaveText('payments')

  await page.context().close()
})

test('a file that is not a draw.io diagram is refused and the board stays as it is', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)

  await page.getByLabel('Файл draw.io').setInputFiles(fixture('not-a-diagram.xml'))

  await expect(page.getByRole('alert')).toHaveText('Это не файл draw.io')
  expect(await tabNames(page)).toEqual(['Страница 1'])

  await page.context().close()
})
