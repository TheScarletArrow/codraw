import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, createBoard, edges, twoParticipants, userPage, vertices } from './helpers.ts'

const arrows = (page: Page) => page.getByRole('button', { name: /^Добавить фигуру / })
const arrow = (page: Page, where: string) => page.getByRole('button', { name: `Добавить фигуру ${where}` })
const shapeList = (page: Page) => page.getByRole('dialog', { name: 'Фигуры для связи' })

/** A page of a signed-in user on a fresh board. */
async function freshBoard(browser: Parameters<typeof userPage>[0]) {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  return page
}

test('an arrow of a table offers only a table and adds it connected on its side', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const source = await addShape(alice, 'Таблица')

  await arrow(alice, 'справа').click()
  await expect(shapeList(alice).getByRole('button')).toHaveText(['Таблица'])
  await shapeList(alice).getByRole('button', { name: 'Таблица' }).click()

  await expect(shapeList(alice)).toBeHidden()
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  const table = (await vertices(alice)).find((cell) => cell.id === source)!
  const added = (await vertices(alice)).find((cell) => cell.id !== source)!
  expect(added).toMatchObject({ value: 'Таблица', x: table.x + table.width + 80, y: table.y })
  expect(added.style).toMatchObject({ childLayout: 'stackLayout', codrawShape: 'table' })
  expect(await edges(alice)).toEqual([expect.objectContaining({ source, target: added.id })])
  // The new table is selected, so its arrows continue the chain.
  await expect(arrows(alice)).toHaveCount(4)

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id).sort()).toEqual([source, added.id].sort())
  await expect.poll(async () => (await edges(bob)).map(({ source, target }) => [source, target])).toEqual([
    [source, added.id],
  ])

  await close()
})

test('an arrow of a service offers system design shapes only', async ({ browser }) => {
  const page = await freshBoard(browser)
  await addShape(page, 'Сервис')

  await arrow(page, 'снизу').click()
  const list = shapeList(page)
  await expect(list.getByRole('button', { name: 'База данных', exact: true })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Балансировщик нагрузки' })).toBeVisible()
  for (const name of ['Таблица', 'Container', 'Граница', 'Прямоугольник']) {
    await expect(list.getByRole('button', { name, exact: true })).toHaveCount(0)
  }

  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  expect(await vertices(page)).toHaveLength(1)

  await page.context().close()
})

test('undo removes the connected shape and its edge together', async ({ browser }) => {
  const page = await freshBoard(browser)
  const service = await addShape(page, 'Сервис')
  await arrow(page, 'снизу').click()
  await shapeList(page).getByRole('button', { name: 'База данных', exact: true }).click()
  await expect.poll(async () => (await edges(page)).length).toBe(1)
  const shapes = await vertices(page)
  const source = shapes.find((cell) => cell.id === service)!
  const database = shapes.find((cell) => cell.id !== service)!
  expect(database).toMatchObject({ value: 'База данных', y: source.y + source.height + 80 })

  await page.getByRole('button', { name: 'Отменить' }).click()

  await expect.poll(async () => (await vertices(page)).map((cell) => cell.id)).toEqual([service])
  expect(await edges(page)).toEqual([])

  await page.context().close()
})

test('frames and fields of a table have no arrows', async ({ browser }) => {
  const page = await freshBoard(browser)
  await addShape(page, 'Граница')
  await expect(arrows(page)).toHaveCount(0)

  const table = await addShape(page, 'Таблица')
  await expect(arrows(page)).toHaveCount(4)
  // The first field lies under the 30 px header of the table.
  const box = await cellBox(page, table)
  await page.mouse.click(box.x + box.width / 2, box.y + 30 + 13)
  await expect(arrows(page)).toHaveCount(0)

  await page.context().close()
})
