import { expect, test } from '@playwright/test'

test('the terms and the privacy policy open from the login page without a sign-in, naming the operator', async ({ page }) => {
  await page.goto('/login')

  await page.getByRole('link', { name: 'политику конфиденциальности' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { name: 'Политика конфиденциальности', level: 1 })).toBeVisible()
  // The operator of the e2e profile of the backend.
  await expect(page.getByText(/Оператор сервиса — Команда CoDraw/).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'privacy@codraw.test' }).first()).toHaveAttribute('href', 'mailto:privacy@codraw.test')
  await expect(page.getByRole('region', { name: 'Сколько хранятся данные' })).toContainText('100 последних версий')

  await page.getByRole('navigation', { name: 'Документы' }).getByRole('link', { name: 'Условия использования' }).click()
  await expect(page).toHaveURL(/\/terms$/)
  await expect(page.getByRole('heading', { name: 'Условия использования', level: 1 })).toBeVisible()
})
