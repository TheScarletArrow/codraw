import { expect, test } from '@playwright/test'

test('the login page offers the ways to sign in of the installation, the corporate provider among them', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('link', { name: 'Войти через GitHub' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Войти через Keycloak компании' })).toHaveAttribute(
    'href',
    '/api/oauth2/authorization/corp',
  )
  await expect(page.getByRole('button', { name: 'Продолжить без входа' })).toBeVisible()
})

test('signing in through a corporate provider that does not answer comes back to the login page with an error', async ({
  page,
}) => {
  await page.goto('/login')

  await page.getByRole('link', { name: 'Войти через Keycloak компании' }).click()

  await expect(page).toHaveURL(/\/login\?error$/)
  await expect(page.getByRole('alert')).toHaveText('Вход не выполнен. Попробуйте ещё раз.')
})

test('the privacy policy names the corporate provider that the operator chose', async ({ page }) => {
  await page.goto('/privacy')

  await expect(page.getByRole('region', { name: 'Кому передаются данные' })).toContainText(
    'Провайдер входа, которого выбрал оператор, — Keycloak компании — узнаёт о входе и выходе через него по правилам оператора.',
  )
})
