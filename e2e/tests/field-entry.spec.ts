import { expect, test, type Page } from '@playwright/test'
import { addShape, twoParticipants } from './helpers.ts'

/** The texts of the fields of a table. */
const fieldsOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return graph
      .getDataModel()
      .getCell(id)
      .getChildren()
      .filter((cell: any) => cell.isVertex())
      .map((field: any) => field.getValue())
  }, id)

test('a field typed in one line is applied on Enter as CoDraw writes it, for everybody', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const table = await addShape(alice, 'Таблица')

  await alice.getByRole('button', { name: 'Добавить поле' }).click()
  await alice.keyboard.type('created_at timestamptz not null default now()')
  await alice.keyboard.press('Enter')

  await expect.poll(() => fieldsOf(bob, table)).toEqual(['id uuid PK', 'created_at timestamptz NOT NULL DEFAULT now()'])
  await expect(
    alice.getByRole('group', { name: 'Свойства поля' }).getByRole('combobox', { name: 'Тип поля' }),
  ).toHaveValue('timestamptz')
  await close()
})
