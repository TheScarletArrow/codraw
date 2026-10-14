import { expect, test, type Page } from '@playwright/test'
import { createBoard, listedBoardLink } from './helpers.ts'

/** Fills the form of the login page with the login and the password and signs in. */
async function signInWithPassword(page: Page, login: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Логин').fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
}

test('a guest signs up with a login and a password, keeps the boards, signs out and signs in again', async ({ browser }) => {
  // Test users keep the accounts of earlier runs: every run registers a login of its own.
  const login = `alice-${Date.now().toString(36)}`
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Продолжить без входа' }).click()
  const boardPath = new URL(await createBoard(page)).pathname

  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Войти' }).click()
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await page.getByLabel('Логин').fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill('correct horse')
  await page.getByLabel('Повторите пароль').fill('correct horse')
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()

  await expect(page.getByRole('banner')).toContainText(login)
  await expect(page.locator(listedBoardLink(boardPath))).toHaveText('Новая доска')

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signInWithPassword(page, login.toUpperCase(), 'wrong horse')
  await expect(page.getByRole('alert')).toHaveText('Неверный логин или пароль.')

  await signInWithPassword(page, login.toUpperCase(), 'correct horse')
  await expect(page.getByRole('banner')).toContainText(login)
  await expect(page.locator(listedBoardLink(boardPath))).toHaveText('Новая доска')
  await page.context().close()
})

test('a user changes the password, and the other session ends', async ({ browser }) => {
  const login = `bob-${Date.now().toString(36)}`
  const laptop = await (await browser.newContext()).newPage()
  await laptop.goto('/login')
  await laptop.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await laptop.getByLabel('Логин').fill(login)
  await laptop.getByLabel('Пароль', { exact: true }).fill('correct horse')
  await laptop.getByLabel('Повторите пароль').fill('correct horse')
  await laptop.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await expect(laptop.getByRole('banner')).toContainText(login)
  const phone = await (await browser.newContext()).newPage()
  await signInWithPassword(phone, login, 'correct horse')
  await expect(phone.getByRole('banner')).toContainText(login)

  await laptop.goto('/settings/account')
  const section = laptop.getByRole('region', { name: 'Пароль' })
  await section.getByLabel('Текущий пароль').fill('correct horse')
  await section.getByLabel('Новый пароль', { exact: true }).fill('battery staple')
  await section.getByLabel('Повторите новый пароль').fill('battery staple')
  await section.getByRole('button', { name: 'Сменить пароль' }).click()
  await expect(section.getByRole('status')).toHaveText('Пароль сменён. Остальные сеансы завершены.')

  expect((await laptop.request.get('/api/me')).status()).toBe(200)
  expect((await phone.request.get('/api/me')).status()).toBe(401)
  const other = await (await browser.newContext()).newPage()
  await signInWithPassword(other, login, 'correct horse')
  await expect(other.getByRole('alert')).toHaveText('Неверный логин или пароль.')
  await signInWithPassword(other, login, 'battery staple')
  await expect(other.getByRole('banner')).toContainText(login)

  await Promise.all([laptop.context().close(), phone.context().close(), other.context().close()])
})
