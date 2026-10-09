import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, vertices } from './helpers.ts'

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const bar = (page: Page) => page.getByRole('region', { name: 'Представление' })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

/** The names of the shapes the view computed, sorted. */
const computed = async (page: Page) =>
  (await vertices(page))
    .filter((cell) => typeof cell.style.codrawComputed === 'string')
    .map((cell) => cell.value.split('\n')[0])
    .sort()

test('a view of the containers of a system follows the model for everybody, hides what is removed and shows it again', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  // A boundary of a system with a container inside it: the container is a part of the system in the model.
  await addShape(alice, 'Граница системы')
  await addShape(alice, 'Container')

  // Алиса makes the view of the containers of the system.
  await alice.getByRole('button', { name: 'Новое представление' }).click()
  const dialog = alice.getByRole('dialog', { name: 'Новое представление' })
  await expect(dialog.getByLabel('Что показать')).toHaveValue('containers')
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(tab(alice, 'Граница системы: контейнеры')).toHaveAttribute('aria-selected', 'true')
  await expect(tab(alice, 'Граница системы: контейнеры').getByTitle('Представление модели')).toBeVisible()
  await expect(bar(alice)).toContainText('Представление: Контейнеры системы Граница системы')
  await expect.poll(() => computed(alice)).toEqual(['Граница системы', 'Контейнер'])

  // Боб opens it, and Алиса draws another container in the boundary on the first page: the view shows it at once.
  await tab(bob, 'Граница системы: контейнеры').click()
  await expect.poll(() => computed(bob)).toEqual(['Граница системы', 'Контейнер'])
  await tab(alice, 'Страница 1').click()
  const added = await addShape(alice, 'Container')
  await expect.poll(async () => (await vertices(alice)).some((cell) => cell.id === added)).toBe(true)
  await expect.poll(() => computed(bob)).toEqual(['Граница системы', 'Контейнер', 'Контейнер'])

  // Боб removes one computed container: it is hidden on the view, and «Скрыто» shows it again.
  const container = (await vertices(bob)).find((cell) => cell.style.codrawComputed && cell.value.startsWith('Контейнер'))!
  const at = center(await cellBox(bob, container.id))
  await bob.mouse.click(at.x, at.y, { button: 'right' })
  await menu(bob).getByRole('menuitem', { name: 'Удалить', exact: true }).click()
  await expect.poll(() => computed(bob)).toEqual(['Граница системы', 'Контейнер'])
  await bar(bob).getByRole('button', { name: /Скрыто: 1/ }).click()
  await bob.getByRole('button', { name: 'Показать всё' }).click()
  await expect.poll(() => computed(bob)).toEqual(['Граница системы', 'Контейнер', 'Контейнер'])

  // The rule changes as an undo step of the view: the landscape shows the system without its containers.
  await bar(bob).getByRole('button', { name: /Правило/ }).click()
  const rule = bob.getByRole('dialog', { name: 'Правило представления' })
  await rule.getByLabel('Что показать').selectOption('landscape')
  await rule.getByRole('button', { name: 'Применить' }).click()
  await expect(bar(bob)).toContainText('Представление: Ландшафт')
  await expect.poll(() => computed(bob)).toEqual(['Граница системы'])
  await bob.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(() => computed(bob)).toEqual(['Граница системы', 'Контейнер', 'Контейнер'])

  await close()
})
