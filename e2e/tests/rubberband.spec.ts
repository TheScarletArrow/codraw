import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, createBoard, drag, edgePoints, edges, userPage, vertices } from './helpers.ts'

type Point = { x: number; y: number }

/** A page of a signed-in user on a fresh board. */
async function freshBoard(browser: Parameters<typeof userPage>[0]) {
  const page = await userPage(browser, 'Алиса')
  await page.setViewportSize({ width: 1280, height: 800 })
  await createBoard(page)
  return page
}

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

/** Presses on the empty canvas at `from` and drags the selection frame to `to`. */
async function dragFrame(page: Page, from: Point, to: Point, whileDragging?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await whileDragging?.()
  await page.mouse.up()
}

/** Adds a shape and moves it by (dx, dy) from where the palette puts it. */
async function addShapeAt(page: Page, name: string, dx: number, dy = 0) {
  const id = await addShape(page, name)
  const box = await cellBox(page, id)
  await drag(page, center(box), { x: center(box).x + dx, y: center(box).y + dy })
  return id
}

test('the selection frame is shown while dragging and selects the shapes it touches', async ({ browser }) => {
  const page = await freshBoard(browser)
  const left = await addShapeAt(page, 'Сервис', -250)
  const right = await addShapeAt(page, 'Сервис', 250)
  const above = await addShapeAt(page, 'Сервис', 0, -200)
  const a = await cellBox(page, left)
  const b = await cellBox(page, right)

  // From above the middle of the left shape to below the middle of the right one: both are touched only partly,
  // and the third shape stays above the frame.
  await dragFrame(page, { x: center(a).x, y: a.y - 40 }, { x: center(b).x, y: b.y + b.height + 40 }, async () => {
    const band = page.locator('.mxRubberband')
    await expect(band).toBeVisible()
    expect(await band.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
  })

  expect((await selectedIds(page)).sort()).toEqual([left, right].sort())
  await expect(page.locator('.mxRubberband')).toBeHidden()

  // One selection: Delete removes both.
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await vertices(page)).map((cell) => cell.id)).toEqual([above])

  await page.context().close()
})

test('an edge is selected when its line crosses the frame', async ({ browser }) => {
  const page = await freshBoard(browser)
  const source = await addShapeAt(page, 'Сервис', -250)
  const target = await addShapeAt(page, 'Сервис', 250)
  await connect(page, source, target)
  await expect.poll(async () => (await edges(page)).length).toBe(1)
  const [edge] = await edges(page)
  const points = await edgePoints(page, edge!.id)
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  // The middle of the longest segment, away from both shapes.
  const [p, q] = points
    .slice(1)
    .map((point, index) => [points[index]!, point] as const)
    .sort(([a1, b1], [a2, b2]) => Math.hypot(b2.x - a2.x, b2.y - a2.y) - Math.hypot(b1.x - a1.x, b1.y - a1.y))[0]!
  const middle = { x: canvas.x + (p.x + q.x) / 2, y: canvas.y + (p.y + q.y) / 2 }

  await page.mouse.click(canvas.x + 20, canvas.y + 20)
  await dragFrame(page, { x: middle.x - 15, y: middle.y - 40 }, { x: middle.x + 15, y: middle.y + 40 })

  expect(await selectedIds(page)).toEqual([edge!.id])

  await page.context().close()
})

test('a boundary is selected only when the frame holds it wholly', async ({ browser }) => {
  const page = await freshBoard(browser)
  const boundary = await addShape(page, 'Граница')
  const service = await addShape(page, 'Сервис')
  const frame = await cellBox(page, boundary)
  const shape = await cellBox(page, service)

  // Started inside the boundary around the service.
  await dragFrame(page, { x: frame.x + 15, y: frame.y + 40 }, { x: shape.x + shape.width + 10, y: shape.y + shape.height + 10 })
  expect(await selectedIds(page)).toEqual([service])

  await dragFrame(page, { x: frame.x - 20, y: frame.y - 20 }, { x: frame.x + frame.width + 20, y: frame.y + frame.height + 20 })
  expect((await selectedIds(page)).sort()).toEqual([boundary, service].sort())

  await page.context().close()
})

test('Ctrl and the frame add to the selection', async ({ browser }) => {
  const page = await freshBoard(browser)
  const left = await addShapeAt(page, 'Сервис', -250)
  const right = await addShapeAt(page, 'Сервис', 250)
  await page.mouse.click(...(Object.values(center(await cellBox(page, left))) as [number, number]))
  const b = await cellBox(page, right)

  await page.keyboard.down('Control')
  await dragFrame(page, { x: b.x - 20, y: b.y - 20 }, { x: center(b).x, y: center(b).y })
  await page.keyboard.up('Control')

  expect((await selectedIds(page)).sort()).toEqual([left, right].sort())

  await page.context().close()
})
