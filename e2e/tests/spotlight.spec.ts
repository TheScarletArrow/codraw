import { expect, test } from '@playwright/test'
import { addShape, sameView, twoParticipants, view, wheelCanvas } from './helpers.ts'

test('a participant presents to everybody: the others follow, move away and come back, until it ends', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  // Bob works on a page of his own; Alice zooms in on the first page.
  await bob.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(bob.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await addShape(alice, 'Прямоугольник')
  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()

  await alice.getByRole('button', { name: 'Показать всем' }).click()

  // Bob is brought to Alice's page and view.
  const banner = bob.getByRole('region', { name: 'Показ всем' })
  await expect(banner).toContainText('Алиса показывает всем')
  await expect(banner.getByRole('button', { name: 'Не следовать' })).toBeVisible()
  await expect(bob.getByRole('tab', { name: 'Страница 1' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => sameView(bob, alice)).toBe(true)
  const presenting = alice.getByRole('region', { name: 'Показ всем' })
  await expect(presenting).toContainText('Вы показываете всем · следуют 1')

  // Alice scrolls: Bob's view follows.
  await wheelCanvas(alice, 300)
  await expect.poll(() => sameView(bob, alice)).toBe(true)

  // Bob scrolls on his own: he follows no more, and the banner offers to follow again.
  await wheelCanvas(bob, 200)
  await expect(banner.getByRole('button', { name: 'Следовать' })).toBeVisible()
  await expect(presenting).toContainText('следуют 0')
  const scale = (await view(bob)).scale
  await alice.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await alice.waitForTimeout(500)
  expect((await view(bob)).scale).toBe(scale)

  // «Следовать» brings him back to Alice's view.
  await banner.getByRole('button', { name: 'Следовать' }).click()
  await expect.poll(() => sameView(bob, alice)).toBe(true)
  await expect(banner.getByRole('button', { name: 'Не следовать' })).toBeVisible()
  await expect(presenting).toContainText('следуют 1')

  // Alice ends the presentation: Bob's banner goes, and his canvas stays where it is.
  await presenting.getByRole('button', { name: 'Закончить показ' }).click()
  await expect(presenting).toBeHidden()
  await expect(banner).toBeHidden()
  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await alice.waitForTimeout(500)
  expect((await view(bob)).scale).not.toBe((await view(alice)).scale)

  await close()
})
