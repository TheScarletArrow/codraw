import { expect, test } from '@playwright/test'
import {
  addShape,
  cellBox,
  center,
  connect,
  controllableSync,
  createBoard,
  drag,
  edges,
  openBoard,
  twoParticipants,
  userPage,
  vertices,
} from './helpers.ts'

const styleOf = async (page: Parameters<typeof vertices>[0], id: string) =>
  (await vertices(page)).find((cell) => cell.id === id)?.style

test('a shape is recolored for every participant, and undo restores the colors of all selected shapes', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const first = await addShape(alice, 'Прямоугольник')
  const second = await addShape(alice, 'Эллипс')
  // The ellipse is added over the rectangle; move it aside.
  const secondBox = await cellBox(alice, second)
  await drag(alice, { x: secondBox.x + 15, y: secondBox.y + 15 }, { x: secondBox.x + 215, y: secondBox.y + 15 })

  await alice.mouse.click(...(Object.values(center(await cellBox(alice, first))) as [number, number]))
  await alice.getByRole('button', { name: 'Цвет заливки' }).click()
  await alice.getByRole('button', { name: 'Голубой' }).click()
  await alice.getByRole('button', { name: 'Цвет линии' }).click()
  await alice.getByRole('button', { name: 'Синий' }).click()
  await alice.getByRole('button', { name: 'Цвет текста' }).click()
  await alice.getByLabel('Свой цвет').fill('#123456')

  await expect.poll(() => styleOf(bob, first)).toMatchObject({
    fillColor: '#dae8fc',
    strokeColor: '#6c8ebf',
    fontColor: '#123456',
  })

  // Both shapes at once, then one undo step.
  await alice.keyboard.press('Escape')
  await alice.mouse.click(...(Object.values(center(await cellBox(alice, first))) as [number, number]))
  // maxGraph toggles the selection with Ctrl, or Cmd on macOS; the test browser reports Windows.
  await alice.keyboard.down('Control')
  await alice.mouse.click(...(Object.values(center(await cellBox(alice, second))) as [number, number]))
  await alice.keyboard.up('Control')
  await alice.getByRole('button', { name: 'Цвет заливки' }).click()
  await alice.getByRole('button', { name: 'Розовый' }).click()
  await expect.poll(async () => [(await styleOf(bob, first))?.fillColor, (await styleOf(bob, second))?.fillColor]).toEqual([
    '#f8cecc',
    '#f8cecc',
  ])

  await alice.getByRole('button', { name: 'Отменить' }).click()

  await expect.poll(async () => [(await styleOf(bob, first))?.fillColor, (await styleOf(bob, second))?.fillColor]).toEqual([
    '#dae8fc',
    undefined,
  ])

  await close()
})

test('an edge has line and text colors but no fill', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const first = await addShape(alice, 'Прямоугольник')
  const second = await addShape(alice, 'Эллипс')
  const secondBox = await cellBox(alice, second)
  await drag(alice, { x: secondBox.x + 15, y: secondBox.y + 15 }, { x: secondBox.x + 215, y: secondBox.y + 15 })
  await connect(alice, first, second)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)
  const [edge] = await edges(alice)

  await alice.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    graph.setSelectionCell(graph.getDataModel().getCell(id))
  }, edge!.id)

  await expect(alice.getByRole('button', { name: 'Цвет линии' })).toBeVisible()
  await expect(alice.getByRole('button', { name: 'Цвет заливки' })).toHaveCount(0)
  await alice.getByRole('button', { name: 'Цвет линии' }).click()
  await alice.getByRole('button', { name: 'Красный' }).click()

  await expect.poll(async () => (await edges(bob))[0]?.style.strokeColor).toBe('#b85450')

  await close()
})

test('a fill and a text color changed at the same time are both kept', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const bobSync = await controllableSync(bob)
  const url = await createBoard(alice)
  await openBoard(bob, url)
  const shape = await addShape(alice, 'Прямоугольник')
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)
  await bob.mouse.click(...(Object.values(center(await cellBox(bob, shape))) as [number, number]))
  await alice.keyboard.press('Escape')
  await alice.mouse.click(...(Object.values(center(await cellBox(alice, shape))) as [number, number]))

  // Neither participant sees the other's change before making their own.
  bobSync.pause()
  await bob.getByRole('button', { name: 'Цвет текста' }).click()
  await bob.getByRole('button', { name: 'Красный' }).click()
  await alice.getByRole('button', { name: 'Цвет заливки' }).click()
  await alice.getByRole('button', { name: 'Светло-зелёный' }).click()
  bobSync.resume()

  for (const page of [alice, bob]) {
    await expect.poll(() => styleOf(page, shape)).toMatchObject({ fillColor: '#d5e8d4', fontColor: '#b85450' })
  }

  await Promise.all([alice.context().close(), bob.context().close()])
})
