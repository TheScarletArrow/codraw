import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, vertices } from './helpers.ts'

/** Double-clicks a shape to edit its label. */
async function editLabel(page: Page, id: string) {
  const { x, y } = center(await cellBox(page, id))
  await page.mouse.dblclick(x, y)
}

/** Applies the label being edited with a click on the empty canvas. */
async function clickOutside(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

const labelOf = async (page: Page, id: string) => (await vertices(page)).find((cell) => cell.id === id)?.value

test('participants see who edits a label and are warned when they edit it together', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  await clickOutside(alice)

  // Alice edits the label: Bob sees her tag next to the shape, outlined in her color.
  await editLabel(alice, shape)
  await alice.keyboard.type('Шлюз')
  const tag = bob.getByTestId('remote-editing-tag')
  await expect(tag).toHaveText('Алиса редактирует')
  await expect(bob.getByTestId('remote-editing')).toHaveAttribute('data-participant', 'Алиса')
  const box = await cellBox(bob, shape)
  const tagBox = (await tag.boundingBox())!
  expect(Math.abs(tagBox.x - box.x)).toBeLessThanOrEqual(8)
  expect(tagBox.y + tagBox.height).toBeLessThanOrEqual(box.y)
  expect(box.y - (tagBox.y + tagBox.height)).toBeLessThanOrEqual(12)

  // Alice applies it: the tag goes.
  await clickOutside(alice)
  await expect(tag).toHaveCount(0)
  await expect(bob.getByTestId('remote-editing')).toHaveCount(0)
  await expect.poll(() => labelOf(bob, shape)).toBe('Шлюз')

  // Alice edits it again, and Bob starts editing the same label: both are warned, and Bob types on.
  await editLabel(alice, shape)
  await alice.keyboard.type('Шлюз API')
  await expect(tag).toHaveText('Алиса редактирует')
  await editLabel(bob, shape)
  const warning = bob.getByTestId('editing-warning')
  await expect(warning).toHaveText('Алиса тоже редактирует эту подпись: сохранится правка, которую закончат последней')
  await expect(alice.getByTestId('editing-warning')).toHaveText(
    'Боб тоже редактирует эту подпись: сохранится правка, которую закончат последней',
  )
  await bob.keyboard.type('API Gateway')

  // Alice applies hers first: Bob is told that the label changed, and his text, applied last, stays.
  await clickOutside(alice)
  await expect(warning).toHaveText('Подпись изменили, пока вы её редактировали. Сохранится ваша правка, Esc отменит её')
  await expect(alice.getByTestId('editing-warning')).toHaveCount(0)
  await expect(alice.getByTestId('remote-editing-tag')).toHaveText('Боб редактирует')
  await clickOutside(bob)
  await expect(warning).toHaveCount(0)
  await expect(alice.getByTestId('remote-editing-tag')).toHaveCount(0)
  await expect.poll(() => labelOf(alice, shape)).toBe('API Gateway')
  await expect.poll(() => labelOf(bob, shape)).toBe('API Gateway')

  await close()
})
