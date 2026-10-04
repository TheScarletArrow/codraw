import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, drag, twoParticipants, vertices, type Box } from './helpers.ts'

interface CellView {
  value: string
  x: number
  y: number
  width: number
  height: number
  style: Record<string, unknown>
  /** Width of the drawn label. */
  labelWidth: number
  children: { id: string; value: string; height: number; style: Record<string, unknown> }[]
}

/** A cell with its geometry, style, drawn label and children, read through the editor the app exposes. */
function cellView(page: Page, id: string): Promise<CellView | null> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const cell = graph.getDataModel().getCell(id)
    if (!cell) return null
    const geometry = cell.getGeometry()
    const label = graph.getView().getState(cell)?.text?.node as SVGGraphicsElement | undefined
    return {
      value: String(cell.getValue() ?? ''),
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      style: { ...cell.getStyle() },
      labelWidth: label?.getBBox().width ?? 0,
      children: cell.getChildren().map((child: any) => ({
        id: child.getId(),
        value: String(child.getValue() ?? ''),
        height: child.getGeometry().height,
        style: { ...child.getStyle() },
      })),
    }
  }, id)
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Инструменты' })
const fontSizeField = (page: Page) => toolbar(page).getByRole('spinbutton', { name: 'Размер текста' })
const click = (page: Page, box: Box) => page.mouse.click(center(box).x, center(box).y)

/** Finishes editing a label with a click on the empty corner of the canvas. */
async function clickEmptyCanvas(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

/** Replaces the label of a shape by typing on the canvas. */
async function relabel(page: Page, id: string, text: string) {
  await page.mouse.dblclick(center(await cellBox(page, id)).x, center(await cellBox(page, id)).y)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(text)
  await clickEmptyCanvas(page)
}

test('the text size of a shape is changed for every participant, step by step, and undone in one step', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  await expect(fontSizeField(alice)).toHaveValue('13')

  await fontSizeField(alice).fill('24')
  await fontSizeField(alice).press('Enter')
  await expect.poll(async () => (await cellView(bob, shape))?.style.fontSize).toBe(24)

  await toolbar(alice).getByRole('button', { name: 'Увеличить текст' }).click()
  await expect.poll(async () => (await cellView(bob, shape))?.style.fontSize).toBe(28)
  await expect(fontSizeField(alice)).toHaveValue('28')

  // Escape brings the shown size back without changing anything.
  await fontSizeField(alice).fill('40')
  await fontSizeField(alice).press('Escape')
  await expect(fontSizeField(alice)).toHaveValue('28')

  await alice.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await cellView(bob, shape))?.style.fontSize).toBe(24)

  await close()
})

test('the text of a table grows with its header and fields, and a new field gets the same size', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const table = await addShape(alice, 'Таблица')

  await fontSizeField(alice).fill('24')
  await fontSizeField(alice).press('Enter')

  await expect.poll(async () => (await cellView(bob, table))?.style).toMatchObject({ fontSize: 24, startSize: 43 })
  const grown = (await cellView(bob, table))!
  expect(grown.children.map((field) => [field.style.fontSize, field.height])).toEqual([[24, 39]])
  expect(grown.height).toBe(43 + 39)

  await click(alice, await cellBox(alice, grown.children[0]!.id))
  await alice.getByRole('button', { name: 'Добавить поле' }).click()
  await alice.keyboard.type('email text')
  await clickEmptyCanvas(alice)

  await expect.poll(async () => (await cellView(bob, table))?.children.map((field) => field.value)).toEqual([
    'id uuid PK',
    'email text',
  ])
  const added = (await cellView(bob, table))!
  expect(added.children[1]).toMatchObject({ height: 39, style: expect.objectContaining({ fontSize: 24 }) })
  expect(added.height).toBe(43 + 2 * 39)

  // A single field changes alone and goes back to the usual height.
  await click(alice, await cellBox(alice, added.children[1]!.id))
  await fontSizeField(alice).fill('13')
  await fontSizeField(alice).press('Enter')
  await expect.poll(async () => (await cellView(bob, table))?.children.map((field) => field.height)).toEqual([39, 26])
  expect((await cellView(bob, table))!.style.fontSize).toBe(24)

  await close()
})

test('auto width fits a shape to its label and follows changes of the label and of the text size', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  await relabel(alice, shape, 'Сервис обработки заказов и платежей')
  const narrow = (await cellView(alice, shape))!
  expect(narrow.labelWidth).toBeGreaterThan(narrow.width)

  await click(alice, await cellBox(alice, shape))
  const autoWidth = toolbar(alice).getByRole('button', { name: 'Автоширина' })
  await expect(autoWidth).toHaveAttribute('aria-pressed', 'false')
  await autoWidth.click()
  await expect(autoWidth).toHaveAttribute('aria-pressed', 'true')

  await expect.poll(async () => (await cellView(bob, shape))?.width).toBeGreaterThan(narrow.width)
  const fitted = (await cellView(alice, shape))!
  expect(fitted.style.autosize).toBe(true)
  expect(fitted.labelWidth).toBeLessThan(fitted.width)
  // The label is in the middle, so the shape keeps its centre.
  expect(Math.abs(fitted.x + fitted.width / 2 - (narrow.x + narrow.width / 2))).toBeLessThanOrEqual(1)
  expect((await cellView(bob, shape))!.width).toBe(fitted.width)

  await toolbar(alice).getByRole('button', { name: 'Увеличить текст' }).click()
  await expect.poll(async () => (await cellView(bob, shape))?.width).toBeGreaterThan(fitted.width)
  const larger = (await cellView(alice, shape))!
  expect(larger.labelWidth).toBeLessThan(larger.width)

  // A shorter label makes the shape narrower; undo brings back the label and the width in one step.
  await relabel(alice, shape, 'API')
  await expect.poll(async () => (await cellView(bob, shape))?.value).toBe('API')
  expect((await cellView(bob, shape))!.width).toBeLessThan(fitted.width)
  await alice.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await cellView(bob, shape))?.value).toBe('Сервис обработки заказов и платежей')
  expect((await cellView(bob, shape))!.width).toBe(larger.width)

  // Dragging a handle to the right sets the width by hand, which turns the auto width off.
  await click(alice, await cellBox(alice, shape))
  const box = await cellBox(alice, shape)
  await drag(alice, { x: box.x + box.width, y: box.y + box.height }, { x: box.x + box.width + 40, y: box.y + box.height })
  await expect.poll(async () => (await cellView(bob, shape))?.width).toBe(larger.width + 40)
  expect((await cellView(bob, shape))!.style.autosize).toBeUndefined()
  await expect(autoWidth).toHaveAttribute('aria-pressed', 'false')
  await relabel(alice, shape, 'API')
  await expect.poll(async () => (await cellView(bob, shape))?.value).toBe('API')
  expect((await cellView(bob, shape))!.width).toBe(larger.width + 40)

  await close()
})

test('a text from the palette and a table with auto width widen with their text', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const text = await addShape(alice, 'Текст')
  expect((await cellView(alice, text))!.style.autosize).toBe(true)
  await relabel(alice, text, 'Заголовок схемы платёжной системы')

  await expect.poll(async () => (await cellView(bob, text))?.value).toBe('Заголовок схемы платёжной системы')
  const widened = (await cellView(alice, text))!
  expect(widened.width).toBeGreaterThan(100)
  expect(widened.labelWidth).toBeLessThan(widened.width)

  const table = await addShape(alice, 'Таблица')
  await toolbar(alice).getByRole('button', { name: 'Автоширина' }).click()
  await expect.poll(async () => (await cellView(bob, table))?.style.autosize).toBe(true)
  const compact = (await cellView(alice, table))!
  const before = compact.x

  await click(alice, await cellBox(alice, compact.children[0]!.id))
  await alice.getByRole('button', { name: 'Добавить поле' }).click()
  await alice.keyboard.type('created_at timestamptz NOT NULL DEFAULT now()')
  await clickEmptyCanvas(alice)

  await expect.poll(async () => (await cellView(bob, table))?.width).toBeGreaterThan(compact.width)
  const wide = (await cellView(alice, table))!
  // The table keeps its left edge, and the long field is seen whole.
  expect(wide.x).toBe(before)
  const fieldLabel = await alice.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return (graph.getView().getState(graph.getDataModel().getCell(id)).text.node as SVGGraphicsElement).getBBox().width
  }, wide.children[1]!.id)
  expect(fieldLabel).toBeLessThan(wide.width - 16)

  await close()
})

test('the size and the position of shapes are typed in numbers', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const first = await addShape(alice, 'Прямоугольник')
  const second = await addShape(alice, 'Эллипс')
  const secondBox = await cellBox(alice, second)
  await drag(alice, { x: secondBox.x + 15, y: secondBox.y + 15 }, { x: secondBox.x + 215, y: secondBox.y + 15 })

  await click(alice, await cellBox(alice, first))
  await toolbar(alice).getByRole('button', { name: 'Размер', exact: true }).click()
  const size = alice.getByRole('dialog', { name: 'Размер и положение' })
  await expect(size.getByRole('spinbutton', { name: 'Ширина' })).toHaveValue('120')
  for (const [name, value] of [
    ['Ширина', '200'],
    ['Высота', '100'],
    ['X', '40'],
    ['Y', '60'],
  ] as const) {
    await size.getByRole('spinbutton', { name, exact: true }).fill(value)
    await size.getByRole('spinbutton', { name, exact: true }).press('Enter')
  }
  await expect.poll(async () => (await vertices(bob)).find((cell) => cell.id === first)).toMatchObject({
    x: 40,
    y: 60,
    width: 200,
    height: 100,
  })
  await alice.keyboard.press('Escape')

  // Both shapes at once: their X differs, so the field is empty, and the new X is one undo step.
  await click(alice, await cellBox(alice, first))
  await alice.keyboard.down('Control')
  await click(alice, await cellBox(alice, second))
  await alice.keyboard.up('Control')
  await toolbar(alice).getByRole('button', { name: 'Размер', exact: true }).click()
  await expect(size.getByRole('spinbutton', { name: 'X' })).toHaveValue('')
  await size.getByRole('spinbutton', { name: 'X' }).fill('300')
  await size.getByRole('spinbutton', { name: 'X' }).press('Enter')
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.x)).toEqual([300, 300])
  await alice.keyboard.press('Escape')
  await alice.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await vertices(bob)).find((cell) => cell.id === first)?.x).toBe(40)
  expect((await vertices(bob)).find((cell) => cell.id === second)!.x).not.toBe(300)

  // The fields of a table set its height.
  await addShape(alice, 'Таблица')
  await toolbar(alice).getByRole('button', { name: 'Размер', exact: true }).click()
  await expect(size.getByRole('spinbutton', { name: 'Высота' })).toBeDisabled()
  await expect(size.getByRole('spinbutton', { name: 'Ширина' })).toBeEnabled()

  await close()
})
