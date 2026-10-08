import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, drag, edges, twoParticipants, vertices } from './helpers.ts'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const crumbs = (page: Page) => page.getByRole('navigation', { name: 'Детализация' })

/** Names of the page tabs in their order. */
const tabNames = (page: Page) => tabs(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))

async function detail(page: Page, id: string) {
  const at = center(await cellBox(page, id))
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await menu(page).getByRole('menuitem', { name: 'Детализировать' }).click()
}

test('«Детализировать» makes the page of the containers of a system for everybody, the crumbs go back, and it opens again', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const system = await addShape(alice, 'Software System')
  const person = await addShape(alice, 'Person')
  // The person, who calls the system, at the left of it.
  const from = center(await cellBox(alice, person))
  await drag(alice, from, { x: from.x - 320, y: from.y })
  await connect(alice, person, system)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)

  await detail(alice, system)

  // Алиса is on the page of detail: the boundary of the system and the person outside it with the edge to the boundary.
  await expect(tab(alice, 'Система: контейнеры')).toHaveAttribute('aria-selected', 'true')
  await expect(crumbs(alice).getByRole('button', { name: 'Страница 1' })).toBeVisible()
  await expect(crumbs(alice).getByText('Система', { exact: true })).toHaveAttribute('aria-current', 'page')
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['Пользователь\n[Person]', 'Система\n[Software System]'])
  expect(await edges(alice)).toHaveLength(1)
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Система: контейнеры'])

  // The crumb goes back up; the system opens the same page again.
  await crumbs(alice).getByRole('button', { name: 'Страница 1' }).click()
  await expect(tab(alice, 'Страница 1')).toHaveAttribute('aria-selected', 'true')
  await detail(alice, system)
  await expect(tab(alice, 'Система: контейнеры')).toHaveAttribute('aria-selected', 'true')
  expect(await tabNames(alice)).toEqual(['Страница 1', 'Система: контейнеры'])

  // Боб, too, goes down from the system of his first page.
  await detail(bob, system)
  await expect(tab(bob, 'Система: контейнеры')).toHaveAttribute('aria-selected', 'true')

  // The page of detail is one undo step of the first page.
  await tab(alice, 'Страница 1').click()
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(() => tabNames(alice)).toEqual(['Страница 1'])
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1'])

  await close()
})
