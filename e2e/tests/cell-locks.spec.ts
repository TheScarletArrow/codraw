import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, drag, twoParticipants, vertices } from './helpers.ts'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Инструменты' })

/** Where a shape is, and whether it is locked, as a participant sees it. */
async function placeOf(page: Page, id: string) {
  const cell = (await vertices(page)).find((candidate) => candidate.id === id)!
  return { x: cell.x, y: cell.y, locked: cell.style.locked === true }
}

test('a locked shape cannot be moved or deleted by another participant until he unlocks it', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')

  // Alice locks the shape from the menu of a right click; Bob gets the lock.
  const onAlice = center(await cellBox(alice, shape))
  await alice.mouse.click(onAlice.x, onAlice.y, { button: 'right' })
  await menu(alice).getByRole('menuitem', { name: 'Закрепить', exact: true }).click()
  await expect.poll(async () => (await placeOf(bob, shape)).locked).toBe(true)
  const placed = await placeOf(bob, shape)

  // Bob selects it and sees who locked it; dragging it and Delete leave it where it is.
  const from = center(await cellBox(bob, shape))
  await bob.mouse.click(from.x, from.y)
  const badge = bob.getByTestId('lock-badge')
  await expect(badge).toHaveAccessibleName('Закреплено: Алиса')
  await expect(badge).toHaveAttribute('title', 'Закреплено: Алиса')
  await expect(toolbar(bob).getByText('Закреплено: Алиса')).toBeVisible()
  await expect(toolbar(bob).getByRole('button', { name: 'Цвет заливки' })).toBeDisabled()
  await drag(bob, from, { x: from.x + 150, y: from.y + 80 })
  await bob.keyboard.press('Delete')
  expect(await placeOf(bob, shape)).toEqual(placed)

  // The menu says who locked it, and does not delete it.
  await bob.mouse.click(from.x, from.y, { button: 'right' })
  await expect(menu(bob)).toHaveAccessibleDescription('Закреплено: Алиса')
  await expect(menu(bob).getByRole('menuitem', { name: 'Удалить', exact: true })).toBeDisabled()
  await bob.keyboard.press('Escape')
  await expect(menu(bob)).toBeHidden()
  expect(await placeOf(alice, shape)).toEqual(placed)

  // Bob unlocks it on the toolbar and moves it, and Alice sees it moved.
  await toolbar(bob).getByRole('button', { name: 'Открепить', exact: true }).click()
  await expect(badge).toHaveCount(0)
  await drag(bob, from, { x: from.x + 150, y: from.y + 80 })
  await expect.poll(async () => placeOf(alice, shape)).toEqual({ x: placed.x + 150, y: placed.y + 80, locked: false })

  await close()
})
