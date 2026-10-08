import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, drag, twoParticipants } from './helpers.ts'

const checks = (page: Page) => page.getByRole('complementary', { name: 'Проверки' })
const properties = (page: Page) => page.getByRole('complementary', { name: 'Свойства' })

function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

test('the checks list the remarks of the board for every participant, go to the element, and share hidden remarks and rules', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const service = await addShape(alice, 'Сервис')
  const database = await addShape(alice, 'База данных')
  // Below the service, where the panels at the right do not cover it.
  const box = await cellBox(alice, database)
  await drag(alice, { x: box.x + 20, y: box.y + 30 }, { x: box.x + 20, y: box.y + 230 })
  await connect(alice, service, database)

  // The edge has no label and no technology, nor do the service and the database.
  await alice.getByRole('button', { name: /^Проверки/ }).click()
  await expect(alice.getByRole('button', { name: 'Проверки: 4 замечания' })).toBeVisible()
  await expect(checks(alice).getByRole('region', { name: 'Связь без подписи' })).toContainText('«Сервис» → «База данных»')
  const technology = checks(alice).getByRole('region', { name: 'Без технологии' })
  await expect(technology).toContainText('Без технологии (2)')

  // A remark goes to its element.
  await technology.getByRole('button', { name: 'стр. «Страница 1»' }).nth(1).click()
  await expect.poll(() => selectedIds(alice)).toEqual([database])

  // Алиса hides the remark of the label and turns the technology of edges off: Боб has the same.
  await checks(alice).getByRole('button', { name: 'Скрыть замечание «Сервис» → «База данных»' }).click()
  await checks(alice).getByRole('tab', { name: 'Правила' }).click()
  await checks(alice).getByRole('checkbox', { name: /Связь без технологии/ }).uncheck()
  await bob.getByRole('button', { name: /^Проверки/ }).click()
  await expect(checks(bob).getByRole('tab', { name: 'Замечания 2' })).toBeVisible()
  await expect(checks(bob).getByRole('region', { name: 'Связь без подписи' })).toHaveCount(0)
  await expect(checks(bob).getByRole('checkbox', { name: 'Показать скрытые (1)' })).toBeVisible()

  // The technology of the service ends its remark for both.
  await alice.getByRole('button', { name: 'Свойства', exact: true }).click()
  const at = center(await cellBox(alice, service))
  await alice.mouse.click(at.x, at.y)
  await expect(properties(alice).getByLabel('Имя', { exact: true })).toHaveValue('Сервис')
  await properties(alice).getByLabel('Технология').fill('Kotlin')
  await properties(alice).getByLabel('Технология').press('Enter')
  await expect(checks(bob).getByRole('region', { name: 'Без технологии' })).toContainText('Без технологии (1)')
  await expect(bob.getByRole('button', { name: 'Проверки: 1 замечание' })).toBeVisible()

  await close()
})
