import { expect, test, type Page } from '@playwright/test'
import { userPage } from './helpers.ts'

const whatsNew = (page: Page) => page.getByRole('dialog', { name: 'Что нового' })

test('«Что нового» opens once after an update and again from the header', async ({ browser }) => {
  const page = await userPage(browser, 'Нина')

  // A browser new to CoDraw is not told about novelties.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Доски', exact: true })).toBeVisible()
  await expect(whatsNew(page)).toBeHidden()

  // The browser last saw an older version: the novelties since then show by themselves, once.
  await page.evaluate(() => localStorage.setItem('codraw.whats-new.last-seen', '0.0.1'))
  await page.reload()
  await expect(whatsNew(page)).toBeVisible()
  await expect(whatsNew(page).getByRole('region').first()).toHaveAccessibleName(/^Версия \d+\.\d+\.\d+$/)
  await page.keyboard.press('Escape')
  await expect(whatsNew(page)).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Доски', exact: true })).toBeVisible()
  await expect(whatsNew(page)).toBeHidden()

  await page.getByRole('banner').getByRole('button', { name: 'Что нового' }).click()
  await expect(whatsNew(page).getByRole('region', { name: 'Версия 0.1.0' })).toBeVisible()
})
