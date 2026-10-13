import { expect, test } from '@playwright/test'

test('the login page offers Яндекс ID and VK ID after GitHub and Google', async ({ page }) => {
  await page.goto('/login')

  const buttons = page.getByRole('link', { name: /^Войти через / })
  await expect(buttons).toHaveText([
    'Войти через GitHub',
    'Войти через Google',
    'Войти через Яндекс ID',
    'Войти через VK ID',
    'Войти через Keycloak компании',
  ])
  await expect(page.getByRole('link', { name: 'Войти через Яндекс ID' })).toHaveAttribute('href', '/api/oauth2/authorization/yandex')
  await expect(page.getByRole('link', { name: 'Войти через VK ID' })).toHaveAttribute('href', '/api/oauth2/authorization/vk')
})

test('signing in through VK ID goes to id.vk.ru with PKCE and a state VK ID takes', async ({ request }) => {
  const response = await request.get('/api/oauth2/authorization/vk', { maxRedirects: 0 })

  expect(response.status()).toBe(302)
  const location = new URL(response.headers()['location'])
  expect(`${location.origin}${location.pathname}`).toBe('https://id.vk.ru/authorize')
  expect(location.searchParams.get('client_id')).toBe('e2e-vk')
  expect(location.searchParams.get('code_challenge_method')).toBe('S256')
  expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{32,}$/)
})

test('the privacy policy names Яндекс ID and VK ID and what of their profiles CoDraw does not keep', async ({ page }) => {
  await page.goto('/privacy')

  await expect(page.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toContainText(
    'Яндекс ID присылает вместе с ними логин и пол, VK ID — пол и дату рождения; CoDraw их не хранит.',
  )
  await expect(page.getByRole('region', { name: 'Кому передаются данные' })).toContainText(
    'GitHub, Google, Яндекс ID и VK ID узнают о входе через них по своим правилам.',
  )
})
