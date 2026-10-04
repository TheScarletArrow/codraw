import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, drag, edges, twoParticipants, vertices } from './helpers.ts'

interface TableInfo {
  id: string
  name: string
  height: number
  width: number
  fields: { id: string; value: string; width: number }[]
}

/** Tables on the canvas with their fields, read through the editor the app exposes on the canvas element. */
function tables(page: Page): Promise<TableInfo[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const parent = container.__codrawEditor.graph.getDefaultParent()
    return Array.from({ length: parent.getChildCount() }, (_, index) => parent.getChildAt(index))
      .filter((cell) => cell.getStyle().childLayout === 'stackLayout')
      .map((table) => ({
        id: table.getId(),
        name: table.getValue(),
        height: table.getGeometry().height,
        width: table.getGeometry().width,
        fields: Array.from({ length: table.getChildCount() }, (_, index) => table.getChildAt(index)).map((field) => ({
          id: field.getId(),
          value: field.getValue(),
          width: field.getGeometry().width,
        })),
      }))
  })
}

function selectedId(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCell()?.getId() ?? null
  })
}

/** Middle of the first segment of an edge, in page coordinates. */
function edgeMiddle(page: Page, id: string) {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as HTMLElement & Record<string, any>
    const { graph } = container.__codrawEditor
    const [a, b] = graph.getView().getState(graph.getDataModel().getCell(id)).absolutePoints
    const rect = container.getBoundingClientRect()
    return { x: rect.left - container.scrollLeft + (a.x + b.x) / 2, y: rect.top - container.scrollTop + (a.y + b.y) / 2 }
  }, id)
}

const click = (page: Page, point: { x: number; y: number }) => page.mouse.click(point.x, point.y)

test('the palette is split into sections', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const palette = alice.getByRole('complementary', { name: 'Фигуры' })

  for (const section of ['Основные', 'База данных', 'Архитектура', 'C4']) {
    await expect(palette.getByRole('group', { name: section })).toBeVisible()
  }

  await close()
})

test('fields of a table are added, renamed and deleted together', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await addShape(alice, 'Таблица')
  await expect.poll(async () => (await tables(bob)).map((table) => table.fields.map((field) => field.value))).toEqual([
    ['id uuid PK'],
  ])
  const [table] = await tables(alice)

  await click(alice, center(await cellBox(alice, table!.fields[0]!.id)))
  await alice.getByRole('button', { name: 'Добавить поле' }).click()
  await alice.keyboard.type('email text')
  await alice.mouse.click(5, 400)

  await expect.poll(async () => (await tables(bob))[0]?.fields.map((field) => field.value)).toEqual(['id uuid PK', 'email text'])
  expect((await tables(bob))[0]!.height).toBe(30 + 2 * 26)

  const email = (await tables(alice))[0]!.fields[1]!
  await click(alice, center(await cellBox(alice, email.id)))
  await alice.keyboard.press('Delete')

  await expect.poll(async () => (await tables(bob))[0]?.fields.map((field) => field.value)).toEqual(['id uuid PK'])
  expect((await tables(bob))[0]!.height).toBe(30 + 26)

  await close()
})

test('a table moves with its fields, and its fields follow its width', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await addShape(alice, 'Таблица')
  const [table] = await tables(alice)
  const box = await cellBox(alice, table!.id)

  const before = (await vertices(alice))[0]!.x

  // The header holds the table name; the table is dragged by it.
  await drag(alice, { x: box.x + box.width / 2, y: box.y + 10 }, { x: box.x + box.width / 2 + 100, y: box.y + 10 })

  await expect.poll(async () => (await vertices(alice))[0]!.x).toBeGreaterThan(before + 50)
  const after = (await vertices(alice))[0]!.x
  await expect.poll(async () => (await vertices(bob))[0]?.x).toBe(after)
  expect((await tables(bob))[0]!.fields).toHaveLength(1)

  const moved = await cellBox(alice, table!.id)
  await click(alice, { x: moved.x + moved.width / 2, y: moved.y + 10 })
  await drag(alice, { x: moved.x + moved.width, y: moved.y + moved.height / 2 }, { x: moved.x + moved.width + 60, y: moved.y + moved.height / 2 })

  await expect.poll(async () => (await tables(bob))[0]?.width).toBeGreaterThan(table!.width)
  const [wide] = await tables(bob)
  expect(wide!.fields.map((field) => field.width)).toEqual([wide!.width])

  await close()
})

test('an edge connects fields of two tables and gets crow’s foot markers', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const canvas = alice.getByTestId('diagram-canvas')
  const tableButton = alice.getByRole('button', { name: 'Таблица', exact: true })
  await tableButton.dragTo(canvas, { targetPosition: { x: 150, y: 150 } })
  await tableButton.dragTo(canvas, { targetPosition: { x: 500, y: 300 } })
  await expect.poll(async () => (await tables(alice)).length).toBe(2)
  const [users, boards] = await tables(alice)

  await connect(alice, users!.fields[0]!.id, boards!.fields[0]!.id)

  await expect.poll(async () => (await edges(bob)).map(({ source, target }) => ({ source, target }))).toEqual([
    { source: users!.fields[0]!.id, target: boards!.fields[0]!.id },
  ])
  const [edge] = await edges(alice)

  await click(alice, await edgeMiddle(alice, edge!.id))
  await expect(alice.getByRole('combobox', { name: 'Конец связи' })).toHaveValue('classic')
  await alice.getByRole('combobox', { name: 'Начало связи' }).selectOption({ label: 'Обязательно один' })
  await alice.getByRole('combobox', { name: 'Конец связи' }).selectOption({ label: 'Ноль или много' })

  await expect.poll(async () => (await edges(bob))[0]?.style).toMatchObject({ startArrow: 'ERmandOne', endArrow: 'ERzeroToMany' })

  await close()
})

test('architecture shapes are added with their captions and draw.io shapes', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const expected: [string, Record<string, unknown>][] = [
    ['Сервис', { rounded: true }],
    ['База данных', { shape: 'cylinder' }],
    ['Очередь', { shape: 'cylinder', direction: 'south' }],
    ['Кэш', { shape: 'cylinder' }],
    ['Пользователь', { shape: 'actor' }],
    ['Внешняя система', { shape: 'cloud' }],
    ['Документ', { shape: 'document' }],
    ['Граница', { dashed: true, fillColor: 'none', pointerEvents: false }],
  ]

  const ids: string[] = []
  for (const [name] of expected) ids.push(await addShape(alice, name))

  await expect.poll(async () => (await vertices(bob)).length).toBe(expected.length)
  const byId = new Map((await vertices(bob)).map((cell) => [cell.id, cell]))
  expected.forEach(([name, style], index) => expect(byId.get(ids[index]!)).toMatchObject({ value: name, style }))

  await close()
})

test('C4 shapes are added with their captions', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  const container = await addShape(alice, 'Container')
  const person = await addShape(alice, 'Person')

  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  const byId = new Map((await vertices(bob)).map((cell) => [cell.id, cell]))
  expect(byId.get(container)).toMatchObject({
    value: 'Контейнер\n[Container: технология]\nОписание',
    style: { fillColor: '#438DD5', rounded: true },
  })
  expect(byId.get(person)!.style.shape).toBe('mxgraph.c4.person2')

  await close()
})

test('a click inside a boundary selects the shape under it', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const service = await addShape(alice, 'Сервис')
  const boundary = await addShape(alice, 'Граница')
  const serviceBox = await cellBox(alice, service)
  const boundaryBox = await cellBox(alice, boundary)
  expect(boundaryBox.x).toBeLessThan(serviceBox.x)
  expect(boundaryBox.x + boundaryBox.width).toBeGreaterThan(serviceBox.x + serviceBox.width)

  await click(alice, center(serviceBox))
  await expect.poll(() => selectedId(alice)).toBe(service)

  // The frame itself still selects the boundary.
  await click(alice, { x: boundaryBox.x + boundaryBox.width / 2, y: boundaryBox.y + boundaryBox.height })
  await expect.poll(() => selectedId(alice)).toBe(boundary)

  await close()
})
