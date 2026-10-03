import { expect, type Page } from '@playwright/test'

/** Creates a board from the home page and waits until its document is synced. */
export async function createBoard(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Создать доску' }).click()
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
  return page.url()
}

/** Opens a board in another page and waits until it is synced. */
export async function openBoard(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
}
