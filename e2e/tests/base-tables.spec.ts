import { expect, test, type Page } from '@playwright/test'
import { addShape, twoParticipants } from './helpers.ts'

/** Selects a table, or its field at `field`, through the editor the app exposes on the canvas element. */
const select = (page: Page, id: string, field: number | null) =>
  page.evaluate(
    ([id, field]) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const { graph } = container.__codrawEditor
      const table = graph.getDataModel().getCell(id)
      graph.setSelectionCell(field === null ? table : table.getChildAt(field))
    },
    [id, field] as const,
  )

/** The text of each field of a table, and whether the table inherits it. */
const fieldsOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return graph
      .getDataModel()
      .getCell(id)
      .getChildren()
      .filter((cell: any) => cell.isVertex())
      .map((field: any) => [field.getValue(), Boolean(field.getStyle().codrawInherited)])
  }, id)

test('a new table gets the default base, and a change of the base reaches it for the other participant', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const base = await addShape(alice, 'Таблица')
  await select(alice, base, null)
  await alice.getByRole('button', { name: 'Базовая' }).click()
  await alice.getByRole('button', { name: 'По умолчанию' }).click()

  const users = await addShape(alice, 'Таблица')

  await expect(alice.getByRole('combobox', { name: 'База таблицы' })).toHaveValue(base)
  await expect.poll(() => fieldsOf(bob, users)).toEqual([['id uuid PK', true]])

  await select(alice, base, 0)
  const panel = alice.getByRole('group', { name: 'Свойства поля' })
  await panel.getByRole('combobox', { name: 'Тип поля' }).fill('bigint')
  await panel.getByRole('combobox', { name: 'Тип поля' }).press('Enter')

  await expect.poll(() => fieldsOf(bob, users)).toEqual([['id bigint PK', true]])
  await select(alice, users, 0)
  await expect(alice.getByText('Из Таблица')).toBeVisible()
  await expect(panel).toHaveCount(0)
  await alice.keyboard.press('Delete')
  await expect.poll(() => fieldsOf(bob, users)).toEqual([['id bigint PK', true]])
  await close()
})
