import { expect, test } from '@playwright/test'
import { cells, twoParticipants } from './helpers.ts'

test('dependency analysis highlights personally and Escape returns the normal view', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.getByRole('region', { name: 'Начните с шаблона' }).getByRole('button', { name: /C4: контейнеры/ }).click()
  await expect.poll(async () => (await cells(bob)).length).toBe(10)
  const before = await cells(alice)
  await alice.evaluate(() => {
    const { graph } = (document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>).__codrawEditor
    const shape = graph.getDefaultParent().getChildren().find((cell: any) => cell.isVertex())
    graph.setSelectionCell(shape)
  })
  await alice.getByRole('button', { name: 'Анализ зависимостей', exact: true }).click()
  const panel = alice.getByRole('complementary', { name: 'Анализ зависимостей' })
  await expect(panel).toContainText('Зависит от:')
  await expect(alice.getByTestId('dependency-marks')).toBeAttached()
  await expect(bob.getByTestId('dependency-marks')).toHaveCount(0)
  await panel.getByRole('combobox', { name: 'Глубина зависимостей' }).selectOption('all')
  expect(await cells(alice)).toEqual(before)
  await alice.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(alice.getByTestId('dependency-marks')).toHaveCount(0)
  await close()
})
