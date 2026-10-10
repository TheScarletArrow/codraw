import { devices, expect, test, type Browser, type Page } from '@playwright/test'
import { cellBox, center, createBoard, signIn, storedVertexCount, userPage, vertices, view, type Box } from './helpers.ts'

// The devices of Playwright without their browser: the tests run in Chromium, which emulates the screen, the user agent
// and the touches. The user agent of an iPhone or an iPad makes maxGraph take touch events instead of pointer events.
const { defaultBrowserType: _phoneBrowser, ...iPhone } = devices['iPhone 14']
const { defaultBrowserType: _tabletBrowser, ...iPad } = devices['iPad Pro 11']
const PHONE = { ...iPhone, viewport: { width: 390, height: 844 } }
const TABLET = { ...iPad, viewport: { width: 820, height: 1180 } }
const { defaultBrowserType: _androidBrowser, ...ANDROID } = devices['Pixel 7']

type Device = typeof PHONE

const panel = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

/** A page of a signed-in user on a phone or a tablet, which touches with fingers. */
async function touchPage(browser: Browser, device: Device, name: string): Promise<Page> {
  const context = await browser.newContext(device)
  await signIn(context.request, name)
  return context.newPage()
}

/** The page scrolls sideways: something is wider than the screen. */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Fingers on the screen, through the touches of Chromium: one finger for a long press or a drag, two for a pinch. */
async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) })
  return {
    async hold(at: { x: number; y: number }, ms = 800) {
      await touch('touchStart', [at])
      await page.waitForTimeout(ms)
      await touch('touchEnd', [])
    },
    async drag(from: { x: number; y: number }, to: { x: number; y: number }) {
      await touch('touchStart', [from])
      for (let step = 1; step <= 10; step++) {
        await touch('touchMove', [{ x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 }])
      }
      await touch('touchEnd', [])
    },
    /** Two fingers `from` apart around `at`, which end `to` apart. */
    async pinch(at: { x: number; y: number }, from: number, to: number) {
      const apart = (distance: number) => [
        { x: at.x - distance / 2, y: at.y },
        { x: at.x + distance / 2, y: at.y },
      ]
      await touch('touchStart', apart(from))
      for (let step = 1; step <= 10; step++) await touch('touchMove', apart(from + ((to - from) * step) / 10))
      await touch('touchEnd', [])
    },
  }
}

/** Adds a rectangle from the palette with taps, as on a phone, and returns its id. */
async function tapShape(page: Page): Promise<string> {
  const before = new Set((await vertices(page)).map((cell) => cell.id))
  // A phone hides the palette until «Фигуры» shows it; a tablet keeps it at the left of the canvas.
  const palette = page.getByRole('button', { name: 'Фигуры', exact: true })
  const hidden = await palette.isVisible()
  if (hidden) await palette.tap()
  await page.getByRole('complementary', { name: 'Фигуры' }).getByRole('button', { name: 'Прямоугольник', exact: true }).tap()
  await expect.poll(async () => (await vertices(page)).length).toBe(before.size + 1)
  // The palette makes room for the canvas again.
  if (hidden) await expect(page.getByRole('complementary', { name: 'Фигуры' })).toBeHidden()
  return (await vertices(page)).find((cell) => !before.has(cell.id))!.id
}

/** A point of the empty canvas near its top-left corner, far from the shapes added in the middle of the view. */
async function emptySpot(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  return { x: canvas.x + 40, y: canvas.y + 60 }
}

const selectedCount = (page: Page) =>
  page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCount() as number
  })

for (const [name, device] of [
  ['phone', PHONE],
  ['tablet', TABLET],
] as const) {
  test(`on a ${name} the boards, a board with its comments and the public view fit the screen`, async ({ browser }) => {
    const page = await touchPage(browser, device, 'Алиса')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Доски' })).toBeVisible()
    expect(await overflow(page)).toBe(0)

    const url = await createBoard(page)
    expect(await overflow(page)).toBe(0)
    await tapShape(page)
    // The public view shows the board as the backend stored it.
    await expect.poll(() => storedVertexCount(url.split('/').pop()!), { timeout: 15_000 }).toBe(1)
    // The title, «Поделиться» and «Комментарии» stay on the line of the board; «Инструменты» shows the rest.
    await expect(page.getByRole('heading', { name: 'Новая доска' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Поделиться' })).toBeVisible()
    const tools = page.getByRole('button', { name: 'Инструменты' })
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeHidden()
    await tools.tap()
    await expect(tools).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible()
    expect(await overflow(page)).toBe(0)
    await tools.tap()

    await page.getByRole('button', { name: 'Комментарии', exact: true }).tap()
    await expect(panel(page)).toBeVisible()
    expect(await overflow(page)).toBe(0)
    if (name === 'phone') {
      // From the bottom across the screen, with the canvas above it.
      const sheet = (await panel(page).boundingBox())!
      expect(sheet.width).toBe(390)
      expect(sheet.y + sheet.height).toBe(844)
      expect(sheet.y).toBeGreaterThan(200)
    }

    await page.getByRole('button', { name: 'Поделиться' }).tap()
    const share = page.getByRole('dialog', { name: 'Поделиться доской' })
    await expect(share).toBeVisible()
    const window = (await share.boundingBox())!
    expect(window.x).toBeGreaterThanOrEqual(0)
    expect(window.x + window.width).toBeLessThanOrEqual(device.viewport.width)
    const changed = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
    await share.getByRole('radio', { name: /^Все, у кого есть ссылка, без входа/ }).check()
    await changed
    await page.keyboard.press('Escape')

    // A reader without a session.
    const reader = await (await browser.newContext(device)).newPage()
    await reader.goto(url.replace('/boards/', '/view/'))
    await expect(reader.getByRole('heading', { name: 'Новая доска' })).toBeVisible()
    await expect(reader.getByTestId('diagram-canvas')).toBeVisible()
    expect(await overflow(reader)).toBe(0)
    await reader.context().close()
    await page.context().close()
  })
}

test('on a phone a finger pans the canvas, two fingers zoom it and a double tap brings it closer, without zooming the page', async ({
  browser,
}) => {
  const page = await touchPage(browser, PHONE, 'Алиса')
  await createBoard(page)
  const shape = await tapShape(page)
  const touch = await fingers(page)

  // A tap selects; a finger on the empty canvas pans it and draws no selection frame.
  const box = await cellBox(page, shape)
  await page.touchscreen.tap(center(box).x, center(box).y)
  await expect.poll(() => selectedCount(page)).toBe(1)
  const before = await view(page)
  const spot = await emptySpot(page)
  await touch.drag(spot, { x: spot.x + 100, y: spot.y + 80 })
  await expect.poll(async () => (await view(page)).x).toBe(before.x - 100)
  expect((await view(page)).y).toBe(before.y - 80)
  expect((await view(page)).scale).toBe(1)
  const moved = await cellBox(page, shape)
  expect(moved.x - box.x).toBeCloseTo(100, 0)
  expect(await selectedCount(page)).toBe(1)

  // Two fingers moving apart zoom the canvas around the point between them; the page keeps its scale.
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }
  await touch.pinch(middle, 60, 180)
  await expect.poll(async () => (await view(page)).scale).toBeCloseTo(3, 1)
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1)
  // Moving them together zooms out, not below 10%.
  await touch.pinch(middle, 300, 10)
  await expect.poll(async () => (await view(page)).scale).toBeLessThan(0.2)
  expect((await view(page)).scale).toBeGreaterThanOrEqual(0.1)
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1)

  // After the pinch a tap selects as before.
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    container.__codrawEditor.zoomTo(1)
    container.__codrawEditor.clearSelection()
  })
  const again = await cellBox(page, shape)
  await page.touchscreen.tap(center(again).x, center(again).y)
  await expect.poll(() => selectedCount(page)).toBe(1)

  // A double tap on the empty canvas brings it closer by half.
  const empty = await emptySpot(page)
  await page.touchscreen.tap(empty.x, empty.y)
  await page.touchscreen.tap(empty.x, empty.y)
  await expect.poll(async () => (await view(page)).scale).toBeCloseTo(1.5, 2)
  await page.context().close()
})

test('on a phone a finger held on a shape opens its menu, and a comment on the shape and an answer are added with taps', async ({
  browser,
}) => {
  const page = await touchPage(browser, PHONE, 'Алиса')
  await createBoard(page)
  const shape = await tapShape(page)
  const touch = await fingers(page)
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    container.__codrawEditor.clearSelection()
  })

  // A short tap selects without a menu.
  const box = await cellBox(page, shape)
  await page.touchscreen.tap(center(box).x, center(box).y)
  await expect.poll(() => selectedCount(page)).toBe(1)
  await expect(menu(page)).toBeHidden()

  // A finger held still selects the shape and opens its menu, which stays open once the finger is lifted. Not at once
  // after the tap: that would be a double tap.
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    container.__codrawEditor.clearSelection()
  })
  await touch.hold(center(box))
  await expect(menu(page)).toBeVisible()
  expect(await selectedCount(page)).toBe(1)
  // It starts no connection.
  expect((await vertices(page)).length).toBe(1)
  await menu(page).getByRole('menuitem', { name: 'Комментировать' }).tap()
  const field = panel(page).getByRole('combobox', { name: 'Новый комментарий' })
  await field.fill('Почему без кэша?')
  await panel(page).getByRole('button', { name: 'Отправить' }).tap()
  const thread = panel(page).getByRole('article', { name: /^Ветка/ })
  await expect(thread).toContainText('Почему без кэша?')

  // An answer in the thread.
  await thread.getByRole('combobox', { name: 'Ответ' }).fill('Кэш будет в следующем релизе')
  await thread.getByRole('button', { name: 'Ответить' }).tap()
  await expect(thread.getByRole('listitem')).toHaveCount(2)

  // A finger held on the empty canvas opens the menu of the canvas.
  await page.getByRole('button', { name: 'Закрыть комментарии' }).tap()
  await touch.hold(await emptySpot(page))
  await expect(menu(page)).toBeVisible()
  expect(await selectedCount(page)).toBe(0)
  await page.keyboard.press('Escape')

  // The comment tool places a comment where a finger taps.
  await page.getByRole('button', { name: 'Инструменты' }).tap()
  const tool = page.getByRole('button', { name: 'Комментарий', exact: true })
  await tool.tap()
  await expect(tool).toHaveAttribute('aria-pressed', 'true')
  const spot = await emptySpot(page)
  await page.touchscreen.tap(spot.x, spot.y + 300)
  await expect(panel(page).getByRole('group', { name: 'Новая ветка' })).toContainText('Место на холсте')
  await page.context().close()
})

test('on Android, where the canvas takes pointer events, fingers pan, zoom and open the menu too', async ({ browser }) => {
  const page = await touchPage(browser, ANDROID, 'Алиса')
  const url = await createBoard(page)
  const boardId = url.split('/').pop()!
  const shape = await tapShape(page)
  await expect.poll(() => storedVertexCount(boardId), { timeout: 15_000 }).toBe(1)
  const touch = await fingers(page)

  const before = await view(page)
  const spot = await emptySpot(page)
  await touch.drag(spot, { x: spot.x + 100, y: spot.y + 100 })
  await expect.poll(async () => (await view(page)).x).toBe(before.x - 100)

  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await touch.pinch({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }, 60, 120)
  await expect.poll(async () => (await view(page)).scale).toBeCloseTo(2, 1)

  await page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    container.__codrawEditor.zoomTo(1)
    container.__codrawEditor.clearSelection()
  })
  const box: Box = await cellBox(page, shape)
  await touch.hold(center(box))
  await expect(menu(page)).toBeVisible()
  await expect(menu(page).getByRole('menuitem', { name: 'Комментировать' })).toBeVisible()
  // The shape stayed where it was: the finger held still moved nothing.
  expect(await cellBox(page, shape)).toEqual(box)
  await page.context().close()
})

test('on a desktop the mouse draws a selection frame on the empty canvas, as before', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  await page.getByRole('complementary', { name: 'Фигуры' }).getByRole('button', { name: 'Прямоугольник', exact: true }).click()
  await expect.poll(async () => (await vertices(page)).length).toBe(1)
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    container.__codrawEditor.clearSelection()
  })
  const before = await view(page)
  const shape = (await vertices(page))[0]!
  const box = await cellBox(page, shape.id)
  await page.mouse.move(box.x - 30, box.y - 30)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 30, box.y + box.height + 30, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => selectedCount(page)).toBe(1)
  expect(await view(page)).toEqual(before)
  // The narrow tools are not on a wide screen.
  await expect(page.getByRole('button', { name: 'Инструменты' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Фигуры', exact: true })).toBeHidden()
  await page.context().close()
})
