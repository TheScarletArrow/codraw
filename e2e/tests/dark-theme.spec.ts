import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  addShape,
  cellBox,
  center,
  connect,
  createBoard,
  drag,
  edges,
  openBoard,
  twoParticipants,
  userPage,
} from './helpers.ts'

/** The color that black lines and text on the dark canvas are drawn with; DARK_CANVAS_INK of the frontend. */
const DARK_INK = '#e6edf3'

/** The policy of the production server for the pages of the app. */
async function productionPolicy(): Promise<string> {
  const config = await readFile(new URL('../../frontend/nginx/security-headers.conf', import.meta.url), 'utf8')
  return /add_header Content-Security-Policy "([^"]+)"/.exec(config)![1]!
}

/** Chooses a theme in «Тема» of the menu of the user. */
async function chooseTheme(page: Page, theme: 'Как в системе' | 'Светлая' | 'Тёмная') {
  await page.getByRole('banner').getByRole('button', { name: /^Тема:/ }).click()
  await page.getByRole('dialog', { name: 'Тема' }).getByRole('radio', { name: theme }).check()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('banner').getByRole('button', { name: `Тема: ${theme}` })).toBeVisible()
}

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))
const canvasBackground = (page: Page) =>
  page.getByTestId('diagram-canvas').evaluate((canvas) => getComputedStyle(canvas).backgroundColor)

/** The colors a cell is drawn with on the canvas of the page: of its line, of its text and of the text in the page. */
function drawn(page: Page, id: string): Promise<{ stroke: string; font: string; text: string | null }> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const state = graph.getView().getState(graph.getDataModel().getCell(id))
    const text = state.text?.node.querySelector('[fill]')?.getAttribute('fill') ?? null
    return { stroke: state.style.strokeColor, font: state.style.fontColor, text }
  }, id)
}

const drawnStroke = async (page: Page, id: string) => (await drawn(page, id)).stroke

const WHITE = 'rgb(255, 255, 255)'
const DARK_CANVAS = 'rgb(27, 29, 33)'

test('the theme chosen in the menu applies at once, also to the canvas and other tabs, and stays after a reload', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const url = await createBoard(alice)
  const otherTab = await alice.context().newPage()
  await otherTab.goto('/')
  await expect(otherTab.getByRole('banner').getByRole('button', { name: 'Тема: Как в системе' })).toBeVisible()
  await expect(alice.getByRole('banner').getByRole('button', { name: 'Тема: Как в системе' })).toBeVisible()
  expect(await canvasBackground(alice)).toBe(WHITE)

  await chooseTheme(alice, 'Тёмная')

  expect(await isDark(alice)).toBe(true)
  expect(await canvasBackground(alice)).toBe(DARK_CANVAS)
  // The tab opened before follows the choice.
  await expect.poll(() => isDark(otherTab)).toBe(true)
  await expect(otherTab.getByRole('banner').getByRole('button', { name: 'Тема: Тёмная' })).toBeVisible()
  await openBoard(alice, url)
  expect(await isDark(alice)).toBe(true)
  expect(await canvasBackground(alice)).toBe(DARK_CANVAS)
  await expect(alice.getByRole('banner').getByRole('button', { name: 'Тема: Тёмная' })).toBeVisible()

  // A theme of one's own does not follow the system.
  await chooseTheme(alice, 'Светлая')
  await alice.emulateMedia({ colorScheme: 'dark' })
  await openBoard(alice, url)
  expect(await isDark(alice)).toBe(false)
  expect(await canvasBackground(alice)).toBe(WHITE)

  await alice.context().close()
})

test('«Как в системе» follows the color scheme of the system while the board is open', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const shape = await addShape(alice, 'Текст')
  expect((await drawn(alice, shape)).text).toBe('#1f2328')

  await alice.emulateMedia({ colorScheme: 'dark' })

  await expect.poll(() => isDark(alice)).toBe(true)
  await expect.poll(() => canvasBackground(alice)).toBe(DARK_CANVAS)
  // The text without fill lies on the canvas: it is drawn light, its color in the document stays.
  expect((await drawn(alice, shape)).text).toBe(DARK_INK)
  const style = await alice.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return { ...container.__codrawEditor.graph.getDataModel().getCell(id).getStyle() }
  }, shape)
  expect(style).not.toHaveProperty('fontColor')

  await alice.emulateMedia({ colorScheme: 'light' })

  await expect.poll(() => isDark(alice)).toBe(false)
  expect((await drawn(alice, shape)).text).toBe('#1f2328')

  await alice.context().close()
})

test('the dark theme of a participant changes neither the canvas of others nor the document nor the files', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await chooseTheme(alice, 'Тёмная')
  const source = await addShape(alice, 'Прямоугольник')
  const target = await addShape(alice, 'Эллипс')
  const added = center(await cellBox(alice, source))
  await drag(alice, added, { x: added.x - 250, y: added.y })
  await connect(alice, source, target)
  await expect.poll(async () => (await edges(bob)).length).toBe(1)
  const [edge] = await edges(alice)

  // Alice sees the black edge light on her dark canvas, Bob sees it black on his light one, and the document keeps
  // it black.
  expect(await drawnStroke(alice, edge!.id)).toBe(DARK_INK)
  expect(await drawnStroke(bob, edge!.id)).toBe('#1f2328')
  expect(await canvasBackground(bob)).toBe(WHITE)
  expect(edge!.style).not.toHaveProperty('strokeColor')
  expect((await edges(bob))[0]!.style).not.toHaveProperty('strokeColor')

  // The palette shows the color of the edge, not the one it is drawn with.
  await alice.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    graph.setSelectionCell(graph.getDataModel().getCell(id))
  }, edge!.id)
  await alice.getByRole('button', { name: 'Цвет линии' }).click()
  const palette = alice.getByRole('dialog', { name: 'Цвет линии' })
  await expect(palette.getByRole('button', { name: 'Чёрный' })).toHaveAttribute('aria-pressed', 'true')
  await alice.keyboard.press('Escape')

  // Images and the .drawio file have the colors of the diagram on white.
  await alice.getByRole('button', { name: 'Экспорт в изображение' }).click()
  const dialog = alice.getByRole('dialog', { name: 'Экспорт в изображение' })
  const svgDownload = alice.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Сохранить SVG' }).click()
  const svg = await readFile((await (await svgDownload).path())!, 'utf8')
  await alice.keyboard.press('Escape')
  expect(svg).toMatch(/<svg[^>]*><rect width="\d+" height="\d+" fill="#ffffff"\/>/)
  expect(svg).toContain('stroke="#1f2328"')
  expect(svg).not.toContain(DARK_INK)
  expect(await drawnStroke(alice, edge!.id)).toBe(DARK_INK)
  const drawioDownload = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const drawio = await readFile((await (await drawioDownload).path())!, 'utf8')
  expect(drawio).not.toContain(DARK_INK)

  // The theme is no step of the history: Ctrl+Z undoes the edge.
  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await edges(bob)).length).toBe(0)
  expect(await isDark(alice)).toBe(true)

  await close()
})

test('the theme of the browser applies before the app loads, under the policy of the production server', async ({
  browser,
}) => {
  const policy = await productionPolicy()
  const alice = await userPage(browser, 'Алиса')
  const violations: string[] = []
  alice.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text())
  })
  await alice.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } })
  })
  await alice.goto('/')
  // The policy is in force: an inline script does not run.
  const inline = await alice.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'document.documentElement.dataset.inline = "ran"'
    document.head.append(script)
    return document.documentElement.dataset.inline
  })
  expect(inline).toBeUndefined()
  await expect.poll(() => violations.length).toBe(1)
  violations.length = 0
  await chooseTheme(alice, 'Тёмная')

  // Without the scripts of the app the page is dark all the same: the theme is applied before them.
  await alice.route(/\/assets\/.*\.js$/, (route) => route.abort())
  await alice.goto('/')
  expect(await isDark(alice)).toBe(true)
  expect(await alice.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(WHITE)

  await alice.unroute(/\/assets\/.*\.js$/)
  await alice.goto('/')
  await expect(alice.getByRole('banner').getByRole('button', { name: 'Тема: Тёмная' })).toBeVisible()
  expect(violations).toEqual([])

  await alice.context().close()
})
