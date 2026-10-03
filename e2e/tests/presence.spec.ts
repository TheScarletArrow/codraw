import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants } from './helpers.ts'

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
