import { expect, test } from '@playwright/test'
import { addShape, cells, twoParticipants, userPage, vertices } from './helpers.ts'

test('a board made from the ER template has the tables and the edge between their fields', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await alice.goto('/')

  await alice.getByRole('region', { name: 'Начать с шаблона' }).getByRole('button', { name: /ER-диаграмма/ }).click()

  await expect(alice.getByRole('heading', { name: 'ER-диаграмма', level: 2 })).toBeVisible()
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await expect(alice.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')).toHaveText(['ER-диаграмма'])
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual(['users', 'boards', 'board_members'])
  // Edges connect fields, which are children of the tables: the model has them all.
  const fields = await alice.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return graph
      .getDefaultParent()
      .getChildren()
      .filter((cell: any) => cell.isEdge())
      .map((edge: any) => [edge.getTerminal(true).getValue(), edge.getTerminal(false).getValue()])
  })
  expect(fields).toContainEqual(['owner_id uuid FK', 'id uuid PK'])
  // No card of templates on a board that has a diagram.
  await expect(alice.getByRole('region', { name: 'Начните с шаблона' })).toBeHidden()

  await alice.context().close()
})

test('a template chosen on an empty board reaches the other participant and is undone in one step', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const card = alice.getByRole('region', { name: 'Начните с шаблона' })
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: /C4: контейнеры/ }).click()

  await expect(card).toBeHidden()
  await expect.poll(async () => (await vertices(alice)).length).toBe(6)
  await expect.poll(async () => (await cells(bob)).filter((cell) => cell.kind === 'edge').length).toBe(4)
  await expect(bob.getByRole('region', { name: 'Начните с шаблона' })).toBeHidden()

  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await vertices(bob)).length).toBe(0)

  await close()
})

test('the card of templates goes away with the first shape', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await expect(bob.getByRole('region', { name: 'Начните с шаблона' })).toBeVisible()

  await addShape(alice, 'Прямоугольник')

  await expect(alice.getByRole('region', { name: 'Начните с шаблона' })).toBeHidden()
  await expect(bob.getByRole('region', { name: 'Начните с шаблона' })).toBeHidden()

  await close()
})
