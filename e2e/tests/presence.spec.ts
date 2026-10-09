import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, openBoard, twoParticipants, userPage } from './helpers.ts'

/** Name under which the participant appears to others. */
async function ownName(page: Page) {
  const self = page.getByRole('list', { name: 'Участники' }).getByRole('listitem').filter({ hasText: '(вы)' })
  return (await self.textContent())!.replace('(вы)', '').trim()
}

/** Where `page` shows a point given in the diagram coordinates. */
function canvasPoint(page: Page, point: { x: number; y: number }) {
  return page.evaluate((point) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.toCanvasPoint(point) as { x: number; y: number }
  }, point)
}

function diagramPoint(page: Page, clientX: number, clientY: number) {
  return page.evaluate(([x, y]) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.toDiagramPoint(x, y) as { x: number; y: number }
  }, [clientX, clientY] as const)
}

/** Position of the remote cursor relative to the canvas, read from its transform. */
async function cursorPosition(page: Page) {
  const transform = await page.getByTestId('remote-cursor').evaluate((element) => (element as HTMLElement).style.transform)
  const [, x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform)!
  return { x: Number(x), y: Number(y) }
}

test('participants see each other’s cursors at the same diagram point, whatever their zoom', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const bobName = await ownName(bob)
  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!

  await bob.mouse.move(canvas.x + 300, canvas.y + 200, { steps: 3 })
  const cursor = alice.getByTestId('remote-cursor')
  await expect(cursor).toHaveText(bobName)
  await expect.poll(() => cursorPosition(alice)).toEqual({ x: 300, y: 200 })

  await alice.getByRole('button', { name: 'Увеличить' }).click()
  await alice.getByRole('button', { name: 'Увеличить' }).click()
  await bob.mouse.move(canvas.x + 400, canvas.y + 250, { steps: 3 })
  const point = await diagramPoint(bob, canvas.x + 400, canvas.y + 250)
  const expected = await canvasPoint(alice, point)
  await expect.poll(async () => {
    const position = await cursorPosition(alice)
    return Math.max(Math.abs(position.x - expected.x), Math.abs(position.y - expected.y))
  }).toBeLessThanOrEqual(2)

  await bob.mouse.move(canvas.x - 100, canvas.y + 100, { steps: 3 })
  await expect(cursor).toHaveCount(0)

  await close()
})

test('a shape selected by another participant is outlined in their color', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  await alice.mouse.click(5, 300)
  const bobName = await ownName(bob)

  const box = await cellBox(bob, shape)
  await bob.mouse.click(...(Object.values(center(box)) as [number, number]))

  const outline = alice.getByTestId('remote-selection')
  await expect(outline).toHaveAttribute('data-participant', bobName)
  const shapeOnAlice = await cellBox(alice, shape)
  const outlineBox = (await outline.boundingBox())!
  expect(Math.abs(outlineBox.x + outlineBox.width / 2 - (shapeOnAlice.x + shapeOnAlice.width / 2))).toBeLessThanOrEqual(2)
  expect(Math.abs(outlineBox.y + outlineBox.height / 2 - (shapeOnAlice.y + shapeOnAlice.height / 2))).toBeLessThanOrEqual(2)
  expect(outlineBox.width).toBeGreaterThan(shapeOnAlice.width)

  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  await bob.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
  await expect(outline).toHaveCount(0)

  await close()
})

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })

test('the cursor follows the pointer while an edge is drawn to another shape', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const source = await addShape(bob, 'Прямоугольник')
  const target = await addShape(bob, 'Прямоугольник')
  await bob.mouse.click(5, 300)
  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  const from = await cellBox(bob, source)
  const to = center(await cellBox(bob, target))
  const relative = (point: { x: number; y: number }) => ({ x: Math.round(point.x - canvas.x), y: Math.round(point.y - canvas.y) })

  // The connection point is shown just outside the right border of a hovered shape.
  const point = { x: from.x + from.width + 8, y: from.y + from.height / 2 }
  await bob.mouse.move(from.x + from.width / 2, point.y)
  await bob.mouse.move(from.x + from.width - 2, point.y, { steps: 3 })
  await bob.mouse.move(point.x, point.y, { steps: 2 })
  await expect.poll(() => cursorPosition(alice)).toEqual(relative(point))

  // maxGraph stops the pointer events over the target shape while the edge is drawn.
  await bob.mouse.down()
  await bob.mouse.move(point.x + 40, point.y + 40, { steps: 5 })
  await bob.mouse.move(to.x, to.y, { steps: 8 })
  await bob.mouse.move(to.x + 10, to.y + 5, { steps: 2 })
  await expect.poll(() => cursorPosition(alice)).toEqual(relative({ x: to.x + 10, y: to.y + 5 }))
  await bob.mouse.up()

  await close()
})

test('cursors are shown only on the same page, and the list tells where the others are', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const bobName = await ownName(bob)
  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  await bob.mouse.move(canvas.x + 300, canvas.y + 200, { steps: 3 })
  await expect(alice.getByTestId('remote-cursor')).toHaveCount(1)

  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await bob.mouse.move(canvas.x + 320, canvas.y + 220, { steps: 3 })

  await expect(alice.getByTestId('remote-cursor')).toHaveCount(0)
  const bobInList = alice.getByRole('list', { name: 'Участники' }).getByRole('button', { name: new RegExp(bobName) })
  await expect(bobInList).toHaveText(`${bobName} · Страница 1`)
  await expect(tab(alice, 'Страница 1').getByTestId('page-visitor')).toHaveCount(1)

  // Going to Bob brings Alice to his page and his cursor.
  await bobInList.click()
  await expect(tab(alice, 'Страница 1')).toHaveAttribute('aria-selected', 'true')
  await expect(alice.getByTestId('remote-cursor')).toHaveText(bobName)

  await close()
})

test('a cursor outside the visible area is shown at the edge and brought into view with a click', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const bobName = await ownName(bob)
  for (let i = 0; i < 4; i++) await alice.getByRole('button', { name: 'Увеличить' }).click()

  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  await bob.mouse.move(canvas.x + canvas.width - 20, canvas.y + canvas.height - 20, { steps: 3 })

  const label = alice.getByRole('button', { name: `Показать курсор: ${bobName}` })
  await expect(label).toBeVisible()
  await expect(alice.getByTestId('remote-cursor')).toHaveCount(0)

  await label.click()
  await expect(alice.getByTestId('remote-cursor')).toBeVisible()
  const view = (await alice.getByTestId('diagram-canvas').boundingBox())!
  const position = await cursorPosition(alice)
  expect(Math.abs(position.x - view.width / 2)).toBeLessThanOrEqual(30)
  expect(Math.abs(position.y - view.height / 2)).toBeLessThanOrEqual(30)

  await close()
})

test('the participants are in the header of the app and leave the line of the board to its tools', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const carol = await userPage(browser, 'Каролина Длинноимённая-Многосоставная')
  await openBoard(carol, alice.url())
  await alice.setViewportSize({ width: 1280, height: 800 })

  await expect(alice.getByRole('banner').getByRole('list', { name: 'Участники' }).getByRole('listitem')).toHaveCount(3)
  // However many come, the scale and «Показать всё» stay in view, and «Поделиться» stays on the screen.
  const fit = alice.getByRole('button', { name: 'Показать всё' })
  await expect(fit).toBeInViewport({ ratio: 1 })
  await fit.click()
  await expect(alice.getByRole('button', { name: 'Поделиться' })).toBeInViewport({ ratio: 1 })

  await carol.context().close()
  await close()
})
