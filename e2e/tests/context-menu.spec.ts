import { expect, test, type Page } from '@playwright/test'
import {
  addShape,
  cellBox,
  center,
  connect,
  createBoard,
  drag,
  edgePoints,
  edges,
  twoParticipants,
  userPage,
  vertices,
  signIn,
  type Box,
} from './helpers.ts'

// The browser presents itself as Chrome on Windows (the Desktop Chrome device), so the shortcuts of the app are Ctrl
// whatever the host system; Cmd on macOS has its own test.
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const item = (page: Page, name: string) => menu(page).getByRole('menuitem', { name, exact: true })
const menuLabels = (page: Page) =>
  menu(page)
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((element) => element.getAttribute('aria-label')))

/** A page of a signed-in user on a fresh board. */
async function freshBoard(browser: Parameters<typeof userPage>[0]) {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  return page
}

async function rightClick(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(menu(page)).toBeVisible()
}

/** A point of the canvas far from the shapes, which are added in the middle of the view. */
async function emptyPoint(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  return { x: canvas.x + 40, y: canvas.y + canvas.height - 60 }
}

const headerOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + 12 })

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

/** Ids of the fields of a table. */
function fieldIds(page: Page, table: string): Promise<string[]> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const cell = container.__codrawEditor.graph.getDataModel().getCell(id)
    return Array.from({ length: cell.getChildCount() }, (_, index) => cell.getChildAt(index).getId())
  }, table)
}

test('a right click opens the menu of CoDraw with the items of a table instead of the menu of the browser', async ({
  browser,
}) => {
  const page = await freshBoard(browser)
  const table = await addShape(page, 'Таблица')
  await page.evaluate(() => {
    const window_ = window as unknown as { browserMenu: boolean | null }
    window_.browserMenu = null
    document.addEventListener('contextmenu', (event) => (window_.browserMenu = !event.defaultPrevented))
  })

  await rightClick(page, headerOf(await cellBox(page, table)))

  expect(await page.evaluate(() => (window as unknown as { browserMenu: boolean }).browserMenu)).toBe(false)
  expect(await menuLabels(page)).toEqual([
    'Изменить подпись',
    'Добавить поле',
    'Добавить индекс',
    'Вырезать',
    'Копировать',
    'Дублировать',
    'На передний план',
    'На задний план',
    'Закрепить',
    'Комментировать',
    'Удалить',
  ])
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  expect(await vertices(page)).toHaveLength(1)

  await page.context().close()
})

test('a field and the empty canvas get their own menus', async ({ browser }) => {
  const page = await freshBoard(browser)
  const table = await addShape(page, 'Таблица')
  const box = await cellBox(page, table)

  await rightClick(page, { x: box.x + box.width / 2, y: box.y + 30 + 13 })
  expect(await menuLabels(page)).toEqual(['Изменить', 'Добавить поле ниже', 'Комментировать', 'Удалить поле'])
  expect(await selectedIds(page)).toEqual(await fieldIds(page, table))
  await page.keyboard.press('Escape')

  await rightClick(page, await emptyPoint(page))
  expect(await menuLabels(page)).toEqual([
    'Вставить',
    'Выделить всё',
    'Добавить стикер',
    'Отменить',
    'Повторить',
    'Комментировать здесь',
  ])
  // Chromium lets the page read the clipboard of the system, so there may be something to paste.
  await expect(item(page, 'Вставить')).toBeEnabled()
  expect(await selectedIds(page)).toEqual([])

  await item(page, 'Выделить всё').click()
  await expect(menu(page)).toBeHidden()
  expect(await selectedIds(page)).toEqual([table])

  await page.context().close()
})

test('a right click on one of the selected shapes keeps the whole selection', async ({ browser }) => {
  const page = await freshBoard(browser)
  const service = await addShape(page, 'Сервис')
  const database = await addShape(page, 'База данных')
  await page.keyboard.press('Control+a')
  expect((await selectedIds(page)).sort()).toEqual([service, database].sort())

  await rightClick(page, center(await cellBox(page, service)))

  // The menu of several elements: grouping first.
  expect((await menuLabels(page)).slice(0, 2)).toEqual(['Сгруппировать', 'Вырезать'])
  expect((await selectedIds(page)).sort()).toEqual([service, database].sort())

  await page.context().close()
})

test('copied shapes are pasted with the edge between them, and the other participant sees them', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const service = await addShape(alice, 'Сервис')
  const database = await addShape(alice, 'База данных')
  const box = await cellBox(alice, database)
  await drag(alice, center(box), { x: center(box).x + 200, y: center(box).y })
  await connect(alice, service, database)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)
  const originals = await vertices(alice)

  await alice.keyboard.press('Control+a')
  await alice.keyboard.press('Control+c')
  await alice.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(alice)).length).toBe(4)
  const copies = (await vertices(alice)).filter((cell) => !originals.some((original) => original.id === cell.id))
  for (const original of originals) {
    expect(copies).toContainEqual(
      expect.objectContaining({ value: original.value, x: original.x + 20, y: original.y + 20 }),
    )
  }
  const copyIds = copies.map((cell) => cell.id)
  const copiedEdge = (await edges(alice)).find((edge) => copyIds.includes(edge.source!))!
  expect([copiedEdge.source, copiedEdge.target].sort()).toEqual(copyIds.sort())
  expect((await selectedIds(alice)).sort()).toEqual([...copyIds, copiedEdge.id].sort())

  await expect.poll(async () => (await vertices(bob)).length).toBe(4)
  await expect.poll(async () => (await edges(bob)).length).toBe(2)

  await close()
})

test('a shape copied without its neighbour is pasted without the edge, and paste from the menu goes to the click', async ({
  browser,
}) => {
  const page = await freshBoard(browser)
  // «Вставить» of the menu reads the clipboard of the system, which the browser would ask the user about.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const service = await addShape(page, 'Сервис')
  const database = await addShape(page, 'База данных')
  const box = await cellBox(page, database)
  await drag(page, center(box), { x: center(box).x + 200, y: center(box).y })
  await connect(page, service, database)
  await expect.poll(async () => (await edges(page)).length).toBe(1)
  await page.mouse.click(...(Object.values(center(await cellBox(page, service))) as [number, number]))
  await page.keyboard.press('Control+c')

  const point = await emptyPoint(page)
  await rightClick(page, point)
  await item(page, 'Вставить').click()

  await expect.poll(async () => (await vertices(page)).length).toBe(3)
  expect(await edges(page)).toHaveLength(1)
  const pasted = (await vertices(page)).find((cell) => cell.id !== service && cell.id !== database)!
  const target = await page.evaluate(
    ({ x, y }) =>
      (document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>).__codrawEditor.toDiagramPoint(
        x,
        y,
      ),
    point,
  )
  expect(pasted.value).toBe('Сервис')
  expect(pasted.x).toBeCloseTo(target.x, 0)
  expect(pasted.y).toBeCloseTo(target.y, 0)

  await page.context().close()
})

test('a table copied on one page is pasted on another with its fields', async ({ browser }) => {
  const page = await freshBoard(browser)
  await addShape(page, 'Таблица')
  await page.keyboard.press('Control+c')

  await page.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(page.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => (await vertices(page)).length).toBe(0)
  await page.getByTestId('diagram-canvas').click({ position: { x: 40, y: 40 } })
  await page.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(page)).length).toBe(1)
  const [table] = await vertices(page)
  expect(table).toMatchObject({ value: 'Таблица', style: expect.objectContaining({ codrawShape: 'table' }) })
  expect(await fieldIds(page, table!.id)).toHaveLength(1)

  await page.context().close()
})

test('Ctrl+D duplicates a table with its fields as one undo step', async ({ browser }) => {
  const page = await freshBoard(browser)
  const table = await addShape(page, 'Таблица')
  const [original] = await vertices(page)

  await page.keyboard.press('Control+d')

  await expect.poll(async () => (await vertices(page)).length).toBe(2)
  const copy = (await vertices(page)).find((cell) => cell.id !== table)!
  expect(copy).toMatchObject({ value: 'Таблица', x: original!.x + 20, y: original!.y + 20 })
  expect(await fieldIds(page, copy.id)).toHaveLength(1)
  expect(await selectedIds(page)).toEqual([copy.id])

  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await vertices(page)).map((cell) => cell.id)).toEqual([table])

  await page.context().close()
})

test('a shape sent to the back is drawn under the others for the other participant too', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const first = await addShape(alice, 'Прямоугольник')
  const second = await addShape(alice, 'Эллипс')
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id)).toEqual([first, second])

  await rightClick(alice, center(await cellBox(alice, second)))
  await item(alice, 'На задний план').click()

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.id)).toEqual([second, first])
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id)).toEqual([second, first])

  await close()
})

test('reversing an edge swaps its ends', async ({ browser }) => {
  const page = await freshBoard(browser)
  const service = await addShape(page, 'Сервис')
  const database = await addShape(page, 'База данных')
  const box = await cellBox(page, database)
  await drag(page, center(box), { x: center(box).x + 250, y: center(box).y })
  await connect(page, service, database)
  await expect.poll(async () => (await edges(page)).length).toBe(1)
  const [edge] = await edges(page)
  const points = await edgePoints(page, edge!.id)
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  const [start, next] = [points[0]!, points[1]!]

  await rightClick(page, { x: canvas.x + (start.x + next.x) / 2, y: canvas.y + (start.y + next.y) / 2 })
  expect(await menuLabels(page)).toEqual([
    'Изменить подпись',
    'Развернуть направление',
    'Закрепить',
    'Комментировать',
    'Удалить',
  ])
  await item(page, 'Развернуть направление').click()

  await expect.poll(async () => (await edges(page))[0]).toMatchObject({ id: edge!.id, source: database, target: service })

  await page.context().close()
})

test('F2 starts editing the label of the selected shape', async ({ browser }) => {
  const page = await freshBoard(browser)
  await addShape(page, 'Сервис')

  await page.keyboard.press('F2')
  // Select all of the text editor of the browser: the keys of the host system.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Платежи')
  await page.mouse.click(...(Object.values(await emptyPoint(page)) as [number, number]))

  await expect.poll(async () => (await vertices(page)).map((cell) => cell.value)).toEqual(['Платежи'])

  await page.context().close()
})

test('on macOS the shortcuts are Cmd', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: MAC_CHROME })
  await signIn(context.request, 'Алиса')
  const page = await context.newPage()
  await createBoard(page)
  const table = await addShape(page, 'Таблица')

  await page.keyboard.press('Meta+d')
  await expect.poll(async () => (await vertices(page)).length).toBe(2)
  await page.keyboard.press('Meta+z')

  await expect.poll(async () => (await vertices(page)).map((cell) => cell.id)).toEqual([table])

  await context.close()
})
