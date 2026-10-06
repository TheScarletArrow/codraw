import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, vertices } from './helpers.ts'

/** The color of a participant as another one sees it: the dot at their name in the list of participants. */
function colorOf(page: Page, name: string) {
  return page
    .getByRole('list', { name: 'Участники' })
    .getByRole('listitem')
    .filter({ hasText: name })
    .locator('.participant-color')
    .evaluate((dot) => getComputedStyle(dot).backgroundColor)
}

/** How many cells the canvas of the participant selects. */
function selectionCount(page: Page) {
  return page.evaluate(() => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCount() as number
  })
}

test('a participant points with the laser pointer and leaves a short message at the cursor', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  await alice.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
  const placed = (await vertices(alice)).find((cell) => cell.id === shape)!

  // Alice turns the laser pointer on and drags from the shape: Bob sees a trail in her color, and nothing moves.
  const laser = alice.getByRole('button', { name: 'Указка', exact: true })
  await laser.click()
  await expect(laser).toHaveAttribute('aria-pressed', 'true')
  const from = center(await cellBox(alice, shape))
  await alice.mouse.move(from.x, from.y)
  await alice.mouse.down()
  await alice.mouse.move(from.x + 150, from.y + 60, { steps: 10 })
  const trail = bob.locator('[data-testid=laser-trail][data-participant=Алиса]')
  await expect(trail).toHaveCount(1)
  expect(await trail.evaluate((element) => getComputedStyle(element).stroke)).toBe(await colorOf(bob, 'Алиса'))
  const onBob = center(await cellBox(bob, shape))
  const trailBox = (await trail.boundingBox())!
  expect(trailBox.x).toBeLessThan(onBob.x + 150)
  expect(trailBox.x + trailBox.width).toBeGreaterThan(onBob.x)
  await alice.mouse.up()
  expect((await vertices(alice)).find((cell) => cell.id === shape)).toMatchObject({ x: placed.x, y: placed.y })
  expect(await selectionCount(alice)).toBe(0)
  // The trail fades out a second after the last point.
  await expect(trail).toHaveCount(0)

  // Escape turns it off.
  await alice.keyboard.press('Escape')
  await expect(laser).toHaveAttribute('aria-pressed', 'false')

  // Alice presses / and types: Bob sees the message at her cursor as she types it.
  await alice.mouse.move(canvas.x + 300, canvas.y + 200, { steps: 3 })
  await alice.keyboard.press('/')
  const field = alice.getByRole('textbox', { name: 'Сообщение у курсора' })
  await expect(field).toBeFocused()
  await alice.keyboard.type('смотри сюда')
  const bubble = bob.getByTestId('remote-chat')
  await expect(bubble).toHaveText('смотри сюда')
  const cursorBox = (await bob.getByTestId('remote-cursor').boundingBox())!
  const bubbleBox = (await bubble.boundingBox())!
  expect(bubbleBox.x - cursorBox.x).toBeGreaterThanOrEqual(0)
  expect(bubbleBox.x - cursorBox.x).toBeLessThanOrEqual(30)
  expect(bubbleBox.y - cursorBox.y).toBeGreaterThanOrEqual(0)
  expect(bubbleBox.y - cursorBox.y).toBeLessThanOrEqual(60)

  // Enter closes the field and keeps the message for a few seconds; then it goes.
  await alice.keyboard.press('Enter')
  await expect(field).toHaveCount(0)
  await expect(bubble).toHaveText('смотри сюда')
  await expect(bubble).toHaveCount(0, { timeout: 10_000 })

  await close()
})
