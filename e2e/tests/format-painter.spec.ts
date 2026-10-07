import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, cells, center, connect, edges, twoParticipants, userPage, vertices, createBoard } from './helpers.ts'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Инструменты' })

/** The look of the sample: blue fill at 60 %, a red dashed line of 3, bold Georgia of 20. */
const SAMPLE = {
  fillColor: '#dae8fc',
  fillOpacity: 60,
  strokeColor: '#b85450',
  strokeWidth: 3,
  dashed: true,
  fontFamily: 'Georgia',
  fontSize: 20,
  fontStyle: 1,
}

/** Places a shape and gives it a label, through the editor the app exposes on the canvas element. */
function place(page: Page, id: string, x: number, y: number, label: string) {
  return page.evaluate(
    ({ id, x, y, label }) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const model = container.__codrawEditor.graph.getDataModel()
      const cell = model.getCell(id)
      const geometry = cell.getGeometry().clone()
      geometry.x = x
      geometry.y = y
      model.beginUpdate()
      try {
        model.setGeometry(cell, geometry)
        model.setValue(cell, label)
      } finally {
        model.endUpdate()
      }
    },
    { id, x, y, label },
  )
}

/** Styles the shape as {@link SAMPLE} with the commands of the toolbar. */
function styleSample(page: Page, id: string) {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const editor = container.__codrawEditor
    editor.graph.setSelectionCell(editor.graph.getDataModel().getCell(id))
    editor.setColor('fill', '#dae8fc')
    editor.setFillOpacity(60)
    editor.setColor('stroke', '#b85450')
    editor.setLineStyle({ width: 3, dash: 'dashed' })
    editor.setFontFamily('Georgia')
    editor.setFontSize(20)
    editor.toggleFontStyle('bold')
    editor.graph.clearSelection()
  }, id)
}

/** A shape as a participant sees it: where it is, its size, its label and its style. */
async function shapeOf(page: Page, id: string) {
  const { x, y, width, height, value, style } = (await cells(page)).find((cell) => cell.id === id)!
  return { x, y, width, height, value, style }
}

/** Clicks a shape near its left border, where its label is not. */
async function click(page: Page, id: string) {
  const box = await cellBox(page, id)
  await page.mouse.click(box.x + 8, box.y + box.height / 2)
}

/** The middle of the first segment of an edge on the screen. */
function edgeMiddle(page: Page, id: string) {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as HTMLElement & Record<string, any>
    const { graph } = container.__codrawEditor
    const [from, to] = graph.getView().getState(graph.getDataModel().getCell(id)).absolutePoints
    const rect = container.getBoundingClientRect()
    return {
      x: rect.left - container.scrollLeft + (from.x + to.x) / 2,
      y: rect.top - container.scrollTop + (from.y + to.y) / 2,
    }
  }, id)
}

test('Ctrl+Alt+C and Ctrl+Alt+V give two shapes the look of a third for everybody, and one Ctrl+Z takes it back', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const sample = await addShape(alice, 'Прямоугольник')
  const first = await addShape(alice, 'Прямоугольник')
  const second = await addShape(alice, 'Эллипс')
  await place(alice, sample, 40, 40, 'Образец')
  await place(alice, first, 240, 40, 'Сервис')
  await place(alice, second, 440, 40, 'База')
  await styleSample(alice, sample)
  await expect.poll(async () => (await shapeOf(bob, second)).value).toBe('База')
  const before = await Promise.all([shapeOf(bob, first), shapeOf(bob, second)])

  // Shapes in the clipboard, which neither key of the look pastes.
  await click(alice, sample)
  await expect(alice.getByTestId('diagram-canvas')).toBeFocused()
  await alice.keyboard.press('Control+c')
  await alice.keyboard.press('Control+Alt+KeyC')
  await click(alice, first)
  // maxGraph toggles the selection with Ctrl, or Cmd on macOS; the test browser reports Windows.
  await alice.keyboard.down('Control')
  await click(alice, second)
  await alice.keyboard.up('Control')
  await alice.keyboard.press('Control+Alt+KeyV')

  for (const [index, id] of [first, second].entries()) {
    await expect.poll(async () => (await shapeOf(bob, id)).style).toMatchObject(SAMPLE)
    const { style: _style, ...placed } = await shapeOf(bob, id)
    const { style: _before, ...was } = before[index]!
    expect(placed).toEqual(was)
  }
  // The ellipse stays an ellipse.
  expect((await shapeOf(bob, second)).style).toMatchObject({ shape: 'ellipse' })
  expect(await vertices(alice)).toHaveLength(3)

  await alice.keyboard.press('Control+z')

  await expect.poll(async () => (await shapeOf(bob, first)).style).toEqual(before[0]!.style)
  await expect.poll(async () => (await shapeOf(bob, second)).style).toEqual(before[1]!.style)
  expect((await shapeOf(bob, sample)).style).toMatchObject(SAMPLE)

  await close()
})

test('an edge gets only the line and the text of a shape from the context menu, and the toolbar pastes too', async ({
  browser,
}) => {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  const sample = await addShape(page, 'Прямоугольник')
  const from = await addShape(page, 'Прямоугольник')
  const to = await addShape(page, 'Прямоугольник')
  const other = await addShape(page, 'Прямоугольник')
  await place(page, sample, 40, 40, 'Образец')
  await place(page, from, 40, 240, 'Клиент')
  await place(page, to, 400, 240, 'Сервер')
  await place(page, other, 400, 40, 'Очередь')
  await styleSample(page, sample)
  await connect(page, from, to)
  await expect.poll(async () => (await edges(page)).length).toBe(1)
  const edge = (await edges(page))[0]!
  const markers = { startArrow: edge.style.startArrow, endArrow: edge.style.endArrow, edgeStyle: edge.style.edgeStyle }

  const onSample = center(await cellBox(page, sample))
  await page.mouse.click(onSample.x, onSample.y, { button: 'right' })
  await expect(menu(page).getByRole('menuitem', { name: 'Вставить стиль', exact: true })).toBeDisabled()
  await menu(page).getByRole('menuitem', { name: 'Копировать стиль', exact: true }).click()
  await expect(menu(page)).toBeHidden()

  const onEdge = await edgeMiddle(page, edge.id)
  await page.mouse.click(onEdge.x, onEdge.y, { button: 'right' })
  await menu(page).getByRole('menuitem', { name: 'Вставить стиль', exact: true }).click()

  await expect
    .poll(async () => (await edges(page))[0]!.style)
    .toMatchObject({ strokeColor: '#b85450', strokeWidth: 3, dashed: true, fontFamily: 'Georgia', fontSize: 20, fontStyle: 1 })
  const style = (await edges(page))[0]!.style
  expect(style).not.toHaveProperty('fillColor')
  expect(style).not.toHaveProperty('fillOpacity')
  expect({ startArrow: style.startArrow, endArrow: style.endArrow, edgeStyle: style.edgeStyle }).toEqual(markers)

  // The brush and the roller of the toolbar.
  await click(page, other)
  await expect(toolbar(page).getByRole('button', { name: 'Вставить стиль' })).toBeEnabled()
  await toolbar(page).getByRole('button', { name: 'Вставить стиль' }).click()
  await expect.poll(async () => (await shapeOf(page, other)).style).toMatchObject(SAMPLE)

  await page.context().close()
})
