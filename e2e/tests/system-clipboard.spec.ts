import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, createBoard, drag, edges, openBoard, twoParticipants, userPage, vertices } from './helpers.ts'

/** A fragment that draw.io puts into the clipboard: two rectangles and an edge between them. */
const DRAWIO_FRAGMENT =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="a" value="A" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">' +
  '<mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="b" value="B" style="whiteSpace=wrap;html=1;" vertex="1" parent="1">' +
  '<mxGeometry x="240" y="40" width="120" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="e" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b">' +
  '<mxGeometry relative="1" as="geometry"/></mxCell>' +
  '</root></mxGraphModel>'

/** A page that may read and write the clipboard of the system, as another program would. */
async function clipboardPage(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  return {
    write: (text: string) => page.evaluate((value) => navigator.clipboard.writeText(value), text),
    read: () => page.evaluate(() => navigator.clipboard.readText()),
  }
}

/** Clicks an empty place of the canvas, so that the keys go to it. */
async function focusCanvas(page: Page) {
  await page.getByTestId('diagram-canvas').click({ position: { x: 40, y: 40 } })
}

test('shapes copied on a board are pasted into a board of another tab with the edge, in the format of draw.io', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const clipboard = await clipboardPage(alice)
  await createBoard(alice)
  const service = await addShape(alice, 'Сервис')
  const database = await addShape(alice, 'База данных')
  const box = await cellBox(alice, database)
  await drag(alice, center(box), { x: center(box).x + 200, y: center(box).y })
  await connect(alice, service, database)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)

  await alice.keyboard.press('Control+a')
  await alice.keyboard.press('Control+c')

  const copied = await clipboard.read()
  expect(copied.startsWith('%3CmxGraphModel%3E')).toBe(true)
  expect(decodeURIComponent(copied)).toContain('value="Сервис"')

  const other = await alice.context().newPage()
  await openBoard(other, await createBoard(other))
  await focusCanvas(other)
  await other.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(other)).map((cell) => cell.value).sort()).toEqual(['База данных', 'Сервис'])
  const pasted = await vertices(other)
  const [edge] = await edges(other)
  expect([edge!.source, edge!.target].sort()).toEqual(pasted.map((cell) => cell.id).sort())

  await alice.context().close()
})

test('a copied table is SQL for other programs and the same table on a board of another tab', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const clipboard = await clipboardPage(alice)
  await createBoard(alice)
  await addShape(alice, 'Таблица')

  await focusCanvas(alice)
  await alice.keyboard.press('Control+a')
  await alice.keyboard.press('Control+c')

  expect(await clipboard.read()).toBe('CREATE TABLE "Таблица" (\n    id uuid PRIMARY KEY\n);\n')
  const html = await alice.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    return (await item!.getType('text/html')).text()
  })
  expect(html).toContain('data-codraw="%3CmxGraphModel%3E')

  const other = await alice.context().newPage()
  await openBoard(other, await createBoard(other))
  await focusCanvas(other)
  await other.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(other)).map((cell) => [cell.value, cell.style.dbVendor])).toEqual([['Таблица', 'postgresql']])

  await alice.context().close()
})

test('a fragment copied in draw.io is pasted with its styles and edge, and the other participant sees it', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const clipboard = await clipboardPage(alice)
  await clipboard.write(encodeURIComponent(DRAWIO_FRAGMENT))

  await focusCanvas(alice)
  await alice.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual(['A', 'B'])
  const [a] = await vertices(alice)
  expect(a!.style).toMatchObject({ rounded: true, fillColor: '#dae8fc' })
  expect(await edges(alice)).toHaveLength(1)
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  await expect.poll(async () => (await edges(bob)).length).toBe(1)

  // One undo step.
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await vertices(alice)).length).toBe(0)

  await close()
})

test('text from another program becomes a text shape, with the keys or from the menu at the click', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const clipboard = await clipboardPage(alice)
  await createBoard(alice)
  await clipboard.write('Платёжный шлюз')

  await focusCanvas(alice)
  await alice.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual(['Платёжный шлюз'])
  const [text] = await vertices(alice)
  expect(text!.style).toMatchObject({ fillColor: 'none', strokeColor: 'none', autosize: true })

  await clipboard.write('Заметка\nв две строки')
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  const point = { x: canvas.x + 120, y: canvas.y + canvas.height - 120 }
  await alice.mouse.click(point.x, point.y, { button: 'right' })
  await alice.getByRole('menuitem', { name: 'Вставить', exact: true }).click()

  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  const note = (await vertices(alice)).find((cell) => cell.value === 'Заметка\nв две строки')!
  const target = await alice.evaluate(
    ({ x, y }) =>
      (document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>).__codrawEditor.toDiagramPoint(x, y),
    point,
  )
  expect(note.x).toBeCloseTo(target.x, 0)
  expect(note.y).toBeCloseTo(target.y, 0)
  expect(note.height).toBeGreaterThan(text!.height)

  await alice.context().close()
})

test('Ctrl+V while a label is edited pastes into the label, not a new shape', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const clipboard = await clipboardPage(alice)
  await createBoard(alice)
  const shape = await addShape(alice, 'Прямоугольник')
  await clipboard.write('Кэш')

  // The label editor starts with the whole label selected: the pasted text replaces it.
  await alice.mouse.dblclick(...(Object.values(center(await cellBox(alice, shape))) as [number, number]))
  // The keys go to the label once its editor has the keyboard.
  await expect(alice.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await alice.keyboard.press('Control+v')
  await focusCanvas(alice)

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual(['Кэш'])

  await alice.context().close()
})
