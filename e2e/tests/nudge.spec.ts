import { expect, test } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, userPage, createBoard, vertices } from './helpers.ts'

const positionOf = async (page: Parameters<typeof vertices>[0], id: string) => {
  const cell = (await vertices(page)).find((candidate) => candidate.id === id)!
  return { x: cell.x, y: cell.y }
}

test('the arrow keys move the selected shape by a pixel and with Shift by a step of the grid, for everybody', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  const start = await positionOf(alice, shape)

  await alice.keyboard.press('ArrowRight')
  await alice.keyboard.press('ArrowRight')
  await alice.keyboard.press('ArrowRight')
  await alice.keyboard.press('Shift+ArrowDown')

  await expect.poll(() => positionOf(alice, shape)).toEqual({ x: start.x + 3, y: start.y + 10 })
  await expect.poll(() => positionOf(bob, shape)).toEqual({ x: start.x + 3, y: start.y + 10 })

  await alice.keyboard.press('Control+z')
  await expect.poll(() => positionOf(alice, shape)).toEqual({ x: start.x + 3, y: start.y })

  await close()
})

test('the arrow keys move the caret, not the shape, while its label is edited', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const shape = await addShape(alice, 'Прямоугольник')
  const start = await positionOf(alice, shape)

  await alice.mouse.dblclick(...(Object.values(center(await cellBox(alice, shape))) as [number, number]))
  // The keys go to the label once its editor has the keyboard.
  await expect(alice.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await alice.keyboard.press('ArrowLeft')
  await alice.keyboard.press('ArrowUp')
  await alice.keyboard.press('Escape')

  expect(await positionOf(alice, shape)).toEqual(start)

  await alice.context().close()
})

test('a dragged shape lines up with the edge of its neighbour along a guide, off the grid', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const anchor = await addShape(alice, 'Прямоугольник')
  // Off the grid: the top of the anchor is 5 pixels below a line of the grid.
  for (let step = 0; step < 5; step++) await alice.keyboard.press('ArrowDown')
  const top = (await positionOf(alice, anchor)).y
  expect(top % 10).toBe(5)
  const moved = await addShape(alice, 'Эллипс')
  const from = await positionOf(alice, moved)
  const box = await cellBox(alice, moved)

  // Far to the right of the anchor, with the top 3 pixels below its top: within the guide, and nearer another line of
  // the grid.
  const start = center(box)
  const end = { x: start.x + 300, y: start.y + (top + 3 - from.y) }
  await alice.mouse.move(start.x, start.y)
  await alice.mouse.down()
  await alice.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 })
  await alice.mouse.move(end.x, end.y, { steps: 5 })
  // A horizontal line has no height, so it is never «visible» for Playwright: the guide is there.
  await expect(alice.locator('[data-testid=diagram-canvas] path[stroke="#2563eb"][stroke-dasharray]').first()).toBeAttached()
  await alice.mouse.up()

  await expect.poll(async () => (await positionOf(alice, moved)).y).toBe(top)

  await alice.context().close()
})
