import { expect, test, type Download, type Page } from '@playwright/test'
import { createBoard, userPage } from './helpers.ts'

const history = (page: Page) => page.getByRole('complementary', { name: 'История версий' })
const preview = (page: Page) => page.getByRole('region', { name: /^Версия от / })

/** The texts of the fields of the table `name` on the canvas. */
function fieldsOf(page: Page, name: string): Promise<string[]> {
  return page.evaluate((name) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const table = graph.getDefaultParent().getChildren().find((cell: any) => cell.getValue() === name)
    return table ? table.getChildren().map((field: any) => String(field.getValue())) : []
  }, name)
}

/** Where a field of the table `name` is on the canvas, relative to the canvas. */
function fieldBounds(page: Page, name: string, index: number): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(
    ([name, index]) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const editor = container.__codrawEditor
      const table = editor.graph.getDefaultParent().getChildren().find((cell: any) => cell.getValue() === name)
      return editor.cellBounds(table.getChildAt(index).getId())
    },
    [name, index] as const,
  )
}

test('a field renamed after a version is RENAME COLUMN in the migration from the version, as SQL and as Flyway', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await createBoard(alice)

  // A table from DDL.
  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const sqlMenu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await sqlMenu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await sqlMenu.getByRole('textbox', { name: 'DDL' }).fill('CREATE TABLE users (id uuid PRIMARY KEY, mail text);')
  await sqlMenu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(sqlMenu).toBeHidden()
  await expect.poll(() => fieldsOf(alice, 'users')).toEqual(['id uuid PK', 'mail text'])

  // The owner keeps the board as it is.
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  await history(alice).getByRole('button', { name: 'Сохранить версию' }).click()
  await expect(history(alice).getByRole('button', { name: /Вручную/ })).toHaveCount(1)

  // Then renames the field on the canvas: a name alone keeps the type of the field.
  const field = await fieldBounds(alice, 'users', 1)
  await alice.getByTestId('diagram-canvas').dblclick({ position: { x: field.x + 40, y: field.y + field.height / 2 } })
  await expect(alice.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await alice.keyboard.press('ControlOrMeta+a')
  await alice.keyboard.type('email')
  await alice.keyboard.press('Enter')
  await expect.poll(() => fieldsOf(alice, 'users')).toEqual(['id uuid PK', 'email text'])

  // The migration from the version to the board renames the column.
  await history(alice).getByRole('button', { name: /Вручную/ }).click()
  await preview(alice).getByRole('button', { name: 'Сравнить с текущей' }).click()
  await preview(alice).getByRole('button', { name: 'Миграция SQL' }).click()
  const migration = alice.getByRole('dialog', { name: 'Миграция SQL' })
  await expect(migration).toContainText('в «текущая доска»')
  await expect(migration.getByRole('combobox', { name: 'СУБД' })).toHaveValue('postgresql')
  await expect(migration).toContainText('Изменений: 1 · опасных: 0')
  const sql = migration.getByRole('textbox', { name: 'Текст Новая доска — миграция.sql' })
  await expect(sql).toHaveValue(/\nALTER TABLE users RENAME COLUMN mail TO email;\n/)
  await expect(sql).not.toHaveValue(/DROP COLUMN|ADD COLUMN/)
  await migration.getByRole('button', { name: 'Скопировать' }).click()
  await expect(migration).toContainText('Скопировано')
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toContain('ALTER TABLE users RENAME COLUMN mail TO email;')

  // A pair of Flyway: the migration and the migration back, downloaded together.
  await migration.getByRole('radio', { name: 'Flyway' }).check()
  await migration.getByRole('textbox', { name: 'Версия' }).fill('2')
  await migration.getByRole('textbox', { name: 'Описание' }).fill('rename users mail')
  await expect(migration.getByRole('textbox', { name: 'Текст V2__rename_users_mail.sql' })).toHaveValue(
    /ALTER TABLE users RENAME COLUMN mail TO email;/,
  )
  await expect(migration.getByRole('textbox', { name: 'Текст U2__rename_users_mail.sql' })).toHaveValue(
    /ALTER TABLE users RENAME COLUMN email TO mail;/,
  )
  const downloads: Download[] = []
  alice.on('download', (download) => downloads.push(download))
  await migration.getByRole('button', { name: 'Скачать оба файла' }).click()
  await expect
    .poll(() => downloads.map((download) => download.suggestedFilename()))
    .toEqual(['V2__rename_users_mail.sql', 'U2__rename_users_mail.sql'])

  // Another database, another statement.
  await migration.getByRole('combobox', { name: 'СУБД' }).selectOption('SQL Server')
  await expect(migration.getByRole('textbox', { name: 'Текст V2__rename_users_mail.sql' })).toHaveValue(
    /EXEC sp_rename N'users\.mail', N'email', N'COLUMN';/,
  )

  // Nothing of it changed the board.
  await alice.keyboard.press('Escape')
  await expect(migration).toBeHidden()
  await preview(alice).getByRole('button', { name: 'Закрыть' }).click()
  await expect.poll(() => fieldsOf(alice, 'users')).toEqual(['id uuid PK', 'email text'])

  await alice.context().close()
})
