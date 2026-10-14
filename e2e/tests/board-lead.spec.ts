import { expect, test, type Page } from '@playwright/test'
import { createBoard, userPage } from './helpers.ts'

// Users of their own: other tests expect the boards and the shared boards of theirs.
const OWNER = 'Марта'
const LEAD = 'Савва'

const sharing = (page: Page) => page.getByRole('dialog', { name: 'Поделиться доской' })

/** Opens «Поделиться» and waits for the participants of the board. */
async function openSharing(page: Page) {
  await page.getByRole('button', { name: 'Поделиться' }).click()
  await expect(sharing(page).getByRole('list', { name: 'Участники доски' })).toBeVisible()
}

test('the owner makes a member the lead, who renames the board and closes its link but does not delete it, and dismisses them', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const lead = await userPage(browser, LEAD)
  const url = await createBoard(owner)

  // The future lead opens the board through its link, and the owner adds them and makes them the lead.
  await lead.goto(url)
  await expect(lead.getByRole('status')).toHaveText('Синхронизировано')
  await openSharing(owner)
  await sharing(owner).getByRole('region', { name: 'Открывали по ссылке' }).getByRole('button', { name: 'Добавить' }).click()
  const leadRow = sharing(owner).getByRole('listitem', { name: LEAD })
  await expect(leadRow.getByRole('combobox', { name: `Роль: ${LEAD}` })).toHaveValue('editor')
  await leadRow.getByRole('button', { name: 'Сделать главным' }).click()
  await expect(leadRow).toContainText('Главный')
  await owner.keyboard.press('Escape')

  // The lead renames the board without reloading, and the owner sees the new title.
  const title = lead.getByRole('button', { name: 'Новая доска', exact: true })
  await title.click()
  const input = lead.getByRole('textbox', { name: 'Название доски' })
  await input.fill('Платежи')
  await input.press('Enter')
  await expect(owner.getByRole('heading', { name: 'Платежи', level: 2 })).toBeVisible()

  // The lead closes the link, sees themselves as the lead, and neither gives the board away nor deletes it.
  await openSharing(lead)
  const closed = lead.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await sharing(lead).getByRole('radio', { name: /Только я/ }).check()
  await closed
  await expect(sharing(lead).getByRole('listitem', { name: LEAD })).toContainText('Главный')
  await expect(sharing(lead).getByRole('button', { name: 'Сделать владельцем' })).toHaveCount(0)
  await expect(sharing(lead).getByRole('region', { name: 'Пригласить по ссылке' })).toBeVisible()
  await lead.keyboard.press('Escape')
  await lead.getByRole('button', { name: 'Меню доски «Платежи»' }).click()
  await expect(lead.getByRole('menuitem', { name: 'Удалить доску' })).toHaveCount(0)
  await lead.keyboard.press('Escape')

  // Dismissed, the former lead stays an editor and renames nothing any more.
  await openSharing(owner)
  await sharing(owner).getByRole('listitem', { name: LEAD }).getByRole('button', { name: 'Снять главного' }).click()
  await expect(sharing(owner).getByRole('combobox', { name: `Роль: ${LEAD}` })).toHaveValue('editor')
  await expect(lead.getByRole('button', { name: 'Платежи', exact: true })).toHaveCount(0)
  await expect(lead.getByRole('heading', { name: 'Платежи', level: 2 })).toBeVisible()
})
