import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, vertices } from './helpers.ts'

/** Who changed the selected element last, in the bar of the pages under the canvas. */
const lastChange = (page: Page) => page.getByTestId('last-change')

/** Applies the label being edited, or clears the selection, with a click on the empty canvas. */
async function clickOutside(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

const labelOf = async (page: Page, id: string) => (await vertices(page)).find((cell) => cell.id === id)?.value

test('a participant sees who changed an element last and when', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  // The shape Alice added is selected, and it is her own change.
  await expect(lastChange(alice)).toHaveText('Изменено: Алиса (вы), только что')
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)

  // Bob renames the shape.
  const onBob = center(await cellBox(bob, shape))
  await bob.mouse.dblclick(onBob.x, onBob.y)
  await bob.keyboard.type('Шлюз')
  await clickOutside(bob)
  await expect.poll(() => labelOf(alice, shape)).toBe('Шлюз')

  // Alice selects it and sees that Bob changed it, with the exact time in the tooltip.
  await clickOutside(alice)
  await expect(lastChange(alice)).toHaveCount(0)
  const onAlice = center(await cellBox(alice, shape))
  await alice.mouse.click(onAlice.x, onAlice.y)
  await expect(lastChange(alice)).toHaveText('Изменено: Боб, только что')
  await expect(lastChange(alice)).toHaveAttribute('title', /^\d{1,2} \S+ \d{4} г\., \d{1,2}:\d{2}$/)

  // Over an element that is not selected, a second of the pointer shows the same.
  await clickOutside(alice)
  await alice.mouse.move(onAlice.x, onAlice.y, { steps: 3 })
  const tooltip = alice.locator('.mxTooltip')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveText('Изменено: Боб, только что')
  await clickOutside(alice)
  await expect(tooltip).toBeHidden()

  await close()
})
