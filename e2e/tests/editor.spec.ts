import { expect, test } from '@playwright/test'
import {
  addShape,
  cellBox,
  cells,
  center,
  connect,
  createBoard,
  drag,
  edgePoints,
  edges,
  signIn,
  twoParticipants,
  vertices,
} from './helpers.ts'

test('a board shows the diagram canvas', async ({ context, page }) => {
  await signIn(context.request, 'Алиса')
  await createBoard(page)

  const canvas = page.getByTestId('diagram-canvas')
  await expect(canvas).toBeVisible()
  await expect(canvas.locator('svg').first()).toBeAttached()
})

test('shapes are added from the palette by dragging and by clicking', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const canvas = await alice.getByTestId('diagram-canvas').boundingBox()

  await alice
    .getByRole('button', { name: 'Прямоугольник', exact: true })
    .dragTo(alice.getByTestId('diagram-canvas'), { targetPosition: { x: 200, y: 150 } })
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)
  const [rectangle] = await vertices(bob)
  expect(Math.abs(rectangle!.x + rectangle!.width / 2 - 200)).toBeLessThanOrEqual(10)
  expect(Math.abs(rectangle!.y + rectangle!.height / 2 - 150)).toBeLessThanOrEqual(10)

  await alice.getByRole('button', { name: 'Эллипс' }).click()
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  const ellipse = (await vertices(bob)).find((cell) => cell.style.shape === 'ellipse')!
  expect(Math.abs(ellipse.x + ellipse.width / 2 - canvas!.width / 2)).toBeLessThanOrEqual(20)
  expect(Math.abs(ellipse.y + ellipse.height / 2 - canvas!.height / 2)).toBeLessThanOrEqual(20)

  await close()
})

test('shapes are moved, resized and deleted together with their edges', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  const before = (await vertices(alice))[0]!

  const box = await cellBox(alice, shape)
  await drag(alice, { x: box.x + 15, y: box.y + 15 }, { x: box.x + 115, y: box.y + 75 })
  await expect.poll(async () => (await vertices(bob))[0]?.x).toBe(before.x + 100)
  expect((await vertices(bob))[0]!.y).toBe(before.y + 60)

  const moved = await cellBox(alice, shape)
  await alice.mouse.click(moved.x + 15, moved.y + 15)
  await drag(alice, { x: moved.x + moved.width, y: moved.y + moved.height }, { x: moved.x + moved.width + 40, y: moved.y + moved.height + 20 })
  await expect.poll(async () => (await vertices(bob))[0]?.width).toBe(before.width + 40)
  expect((await vertices(bob))[0]!.height).toBe(before.height + 20)

  const other = await addShape(alice, 'Ромб')
  await connect(alice, shape, other)
  await expect.poll(async () => (await edges(bob)).length).toBe(1)

  const resized = await cellBox(alice, shape)
  await alice.mouse.click(resized.x + 15, resized.y + 15)
  await alice.keyboard.press('Delete')
  await expect.poll(async () => (await cells(bob)).map((cell) => cell.id)).toEqual([other])

  await close()
})

test('edges connect shapes orthogonally and follow them when they move', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const source = await addShape(alice, 'Прямоугольник')
  const target = await addShape(alice, 'Эллипс')
  const targetBox = await cellBox(alice, target)
  await drag(alice, { x: targetBox.x + 15, y: targetBox.y + 15 }, { x: targetBox.x + 215, y: targetBox.y + 115 })

  await connect(alice, source, target)

  await expect.poll(async () => (await edges(bob)).length).toBe(1)
  const [edge] = await edges(bob)
  expect(edge).toMatchObject({ source, target })
  const points = await edgePoints(bob, edge!.id)
  expect(points.length).toBeGreaterThan(2)
  for (let i = 1; i < points.length; i++) {
    const horizontal = Math.abs(points[i]!.y - points[i - 1]!.y) < 1
    const vertical = Math.abs(points[i]!.x - points[i - 1]!.x) < 1
    expect(horizontal || vertical).toBe(true)
  }

  const sourceBox = await cellBox(alice, source)
  await drag(alice, { x: sourceBox.x + 15, y: sourceBox.y + 15 }, { x: sourceBox.x + 15, y: sourceBox.y + 215 })
  await expect.poll(async () => (await vertices(bob)).find((cell) => cell.id === source)?.y).toBeGreaterThan(sourceBox.y)
  expect((await edges(bob))[0]).toMatchObject({ source, target })
  const moved = await cellBox(bob, source)
  const [start] = await edgePoints(bob, edge!.id)
  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  const startOnPage = { x: canvas.x + start!.x, y: canvas.y + start!.y }
  expect(startOnPage.y).toBeGreaterThanOrEqual(moved.y - 1)
  expect(startOnPage.y).toBeLessThanOrEqual(moved.y + moved.height + 1)

  await close()
})

test('labels are edited on the canvas with a double click', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')

  await alice.mouse.dblclick(...Object.values(center(await cellBox(alice, shape))) as [number, number])
  await alice.keyboard.type('Сервис заказов')
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  await alice.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)

  await expect.poll(async () => (await vertices(bob))[0]?.value).toBe('Сервис заказов')

  await close()
})
