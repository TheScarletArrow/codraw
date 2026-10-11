import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, createBoardViaApi, csrfHeaders, openBoard, openBoardList, signIn, userPage, vertices } from './helpers.ts'

/** The server gives another build from now on, as after a deployment. */
const deploy = (page: Page) => page.route('**/version.json', (route) => route.fulfill({ json: { version: '9.9.9', build: 'next' } }))

/** The user comes back to the tab: a visible tab asks for the build of the server. Headless pages are always visible. */
const comeBack = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

/** Comes back to the tab and waits for the answer about the build, so that a missing banner is not just a slow one. */
async function comeBackAndAsk(page: Page) {
  const asked = page.waitForResponse((response) => new URL(response.url()).pathname === '/version.json')
  await comeBack(page)
  await asked
}

const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'Вышла новая версия CoDraw' })

/** Marks the window: a reload makes a new one, without the mark. */
const mark = (page: Page) => page.evaluate(() => ((window as unknown as Record<string, unknown>).beforeReload = true))
const marked = (page: Page) => page.evaluate(() => (window as unknown as Record<string, unknown>).beforeReload === true)

/** The file of a page of the app, as the build names it, e.g. `/assets/BoardPage-DY3Ke-Pj.js`. */
const chunk = (name: string) => new RegExp(`/assets/${name}-[\\w-]+\\.js$`)

/** Makes the file of the page answer 404, as a server after a deployment answers for a file of an earlier build. */
async function removeChunk(page: Page, name: string) {
  await page.route(chunk(name), (route) => route.fulfill({ status: 404, body: 'Not Found' }))
}

/**
 * Counts loads of documents at addresses with this path: reloads, unlike moves of the app between its pages. The page
 * that did not load may show for a moment before the reload, so a test waits for the reload before looking at it.
 */
function documentLoads(page: Page, path: string) {
  let count = 0
  page.on('request', (request) => {
    if (request.resourceType() === 'document' && new URL(request.url()).pathname === path) count += 1
  })
  return () => count
}

test('the server gives the same build: the file of the version names it, and no banner shows', async ({ context, page }) => {
  const response = await page.request.get('/version.json')
  expect(response.ok()).toBe(true)
  const build = (await response.json()) as { version: unknown; build: unknown }
  expect(build.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(typeof build.build).toBe('string')
  expect(build.build).not.toBe('')

  await signIn(context.request, 'Обновление')
  await openBoardList(page)
  await comeBackAndAsk(page)
  await expect(banner(page)).toBeHidden()
})

test('after a deployment the list of boards offers a reload, which «Позже» puts off until the page is reloaded', async ({
  context,
  page,
}) => {
  await signIn(context.request, 'Обновление')
  await openBoardList(page)
  await deploy(page)

  await comeBackAndAsk(page)
  await expect(banner(page)).toBeVisible()
  await expect(banner(page).getByRole('button', { name: 'Обновить' })).toBeVisible()
  await banner(page).getByRole('button', { name: 'Позже' }).click()
  await expect(banner(page)).toBeHidden()
  // The tab knows of the new build already and does not bring the banner back.
  await comeBack(page)
  await page.waitForTimeout(500)
  await expect(banner(page)).toBeHidden()

  await page.reload()
  await comeBackAndAsk(page)
  await expect(banner(page)).toBeVisible()
  await mark(page)
  const reloaded = page.waitForEvent('load')
  await banner(page).getByRole('button', { name: 'Обновить' }).click()
  await reloaded
  expect(await marked(page)).toBe(false)
  await expect(page).toHaveURL(/\/$/)
})

test('«Обновить» on a board applies the label being edited before the reload', async ({ browser }) => {
  const alice = await userPage(browser, 'Обновление')
  const url = await createBoard(alice)
  const shape = await addShape(alice, 'Прямоугольник')
  await alice.mouse.dblclick(...(Object.values(center(await cellBox(alice, shape))) as [number, number]))
  await alice.keyboard.type('Сервис платежей')

  await deploy(alice)
  await comeBackAndAsk(alice)
  await mark(alice)
  const reloaded = alice.waitForEvent('load')
  await banner(alice).getByRole('button', { name: 'Обновить' }).click()
  await reloaded
  expect(await marked(alice)).toBe(false)

  await openBoard(alice, url)
  await expect.poll(async () => (await vertices(alice)).find((cell) => cell.id === shape)?.value).toBe('Сервис платежей')
  await alice.context().close()
})

test('a board whose editor file is gone reloads once by itself, then asks for a reload', async ({ context, page }) => {
  await signIn(context.request, 'Обновление')
  const title = `Доска после выкатки ${Date.now()}`
  const boardId = await createBoardViaApi(context.request, title)
  await openBoardList(page)
  await removeChunk(page, 'BoardPage')
  const loads = documentLoads(page, `/boards/${boardId}`)

  await page.getByRole('link', { name: title, exact: true }).click()
  await expect.poll(loads).toBe(1)
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}$`))
  await page.waitForLoadState()
  await expect(page.getByRole('heading', { name: 'CoDraw обновился' })).toBeVisible()
  // A reload that did not help is not repeated.
  await page.waitForTimeout(1000)
  expect(loads()).toBe(1)

  // The server has the file again, as the new build does.
  await page.unroute(chunk('BoardPage'))
  await page.getByRole('button', { name: 'Обновить страницу' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Синхронизировано' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'CoDraw обновился' })).toBeHidden()
})

test('the help opened after a deployment reloads once and asks for a reload, and shows the banner of a new version', async ({
  page,
}) => {
  await removeChunk(page, 'HelpPage')
  const loads = documentLoads(page, '/help')
  await page.goto('/help')
  await expect.poll(loads).toBe(2)
  await page.waitForLoadState()
  await expect(page.getByRole('heading', { name: 'CoDraw обновился' })).toBeVisible()
  await page.waitForTimeout(1000)
  expect(loads()).toBe(2)

  await page.unroute(chunk('HelpPage'))
  await page.getByRole('button', { name: 'Обновить страницу' }).click()
  await expect(page.getByRole('heading', { name: 'CoDraw обновился' })).toBeHidden()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await deploy(page)
  await comeBackAndAsk(page)
  await expect(banner(page)).toBeVisible()
})

test('a board shown to anybody, opened after a deployment, reloads once and asks for a reload, and shows the banner', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Обновление')
  const title = `Публичная доска ${Date.now()}`
  const boardId = await createBoardViaApi(alice.request, title)
  const shared = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'public' },
    headers: await csrfHeaders(alice.request),
  })
  expect(shared.status()).toBe(200)

  // A reader without a session.
  const context = await browser.newContext()
  const reader = await context.newPage()
  await removeChunk(reader, 'PublicBoardPage')
  const loads = documentLoads(reader, `/view/${boardId}`)
  await reader.goto(`/view/${boardId}`)
  await expect.poll(loads).toBe(2)
  await reader.waitForLoadState()
  await expect(reader.getByRole('heading', { name: 'CoDraw обновился' })).toBeVisible()
  await reader.waitForTimeout(1000)
  expect(loads()).toBe(2)

  await reader.unroute(chunk('PublicBoardPage'))
  await reader.getByRole('button', { name: 'Обновить страницу' }).click()
  await expect(reader.getByRole('heading', { name: title })).toBeVisible()

  await deploy(reader)
  await comeBackAndAsk(reader)
  await expect(banner(reader)).toBeVisible()

  await context.close()
  await alice.context().close()
})
