import { expect, test, type Page } from '@playwright/test'
import { createBoard, csrfHeaders, openBoard, userPage } from './helpers.ts'

// Users of their own: the bells of the users of other tests count the notifications of those tests.
const OWNER = 'Аня'
const MEMBER = 'Кирилл'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const thread = (page: Page) => panel(page).getByRole('article', { name: 'Ветка: Вся страница' })
const bell = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Уведомления/ })

/** Earlier runs on the same database leave notifications: a test starts with none unread. */
async function readAll(page: Page) {
  const response = await page.request.post('/api/notifications/read-all', { headers: await csrfHeaders(page.request) })
  expect(response.status()).toBe(204)
}

async function rename(page: Page, url: string, title: string) {
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await page.request.patch(`/api/boards/${boardId}`, { data: { title }, headers: await csrfHeaders(page.request) })
  expect(response.status()).toBe(200)
}

test('a reaction and an assigned thread reach the other participant, who finds the thread among theirs and by the bell', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const member = await userPage(browser, MEMBER)
  await Promise.all([readAll(owner), readAll(member)])
  const url = await createBoard(owner)
  await rename(owner, url, 'Схема БД')
  await openBoard(member, url)

  // Кирилл starts a thread about the page.
  await member.getByRole('button', { name: 'Комментарии', exact: true }).click()
  await panel(member).getByRole('button', { name: 'Комментарий к странице' }).click()
  const field = panel(member).getByRole('combobox', { name: 'Новый комментарий' })
  await field.fill('Поправь связь к API')
  await field.press('Enter')
  await expect(thread(member)).toContainText('Поправь связь к API')

  // Аня reacts with 👍: her chip is pressed, and Кирилл sees it with her name, without reloading.
  await owner.getByRole('button', { name: 'Комментарии (1)' }).click()
  await thread(owner).getByRole('button', { name: 'Добавить реакцию' }).click()
  await owner.getByRole('dialog', { name: 'Набор реакций' }).getByRole('button', { name: '👍' }).click()
  await expect(thread(owner).getByRole('button', { name: '👍 1' })).toHaveAttribute('aria-pressed', 'true')
  const chip = thread(member).getByRole('button', { name: '👍 1' })
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  await expect(chip).toHaveAttribute('title', OWNER)

  // Аня assigns the thread to Кирилл, who finds it among the threads assigned to him.
  await thread(owner).getByRole('button', { name: 'Назначить' }).click()
  await owner.getByRole('dialog', { name: 'Назначить ответственного' }).getByRole('button', { name: MEMBER }).click()
  await expect(thread(owner)).toContainText('Ответственный:')
  await expect(thread(owner).getByRole('button', { name: MEMBER })).toBeVisible()
  await panel(member).getByRole('button', { name: 'Назначены мне' }).click()
  await expect(thread(member).getByRole('button', { name: MEMBER })).toBeVisible()
  await expect(thread(member)).toContainText('Поправь связь к API')

  // The bell of Кирилл tells of the assignment and leads to the thread.
  await bell(member).click()
  const assigned = member
    .getByRole('dialog', { name: 'Уведомления' })
    .getByRole('link', { name: new RegExp(`^${OWNER}: вам назначена ветка в «Схема БД»`) })
    .first()
  await expect(assigned).toContainText('Поправь связь к API')
  await expect(assigned).toContainText('Не прочитано')
  await assigned.click()
  await expect(thread(member)).toHaveAttribute('aria-current', 'true')
  await expect(bell(member)).toHaveAccessibleName('Уведомления')

  // Кирилл puts his 👍 too, and Аня sees both names.
  await thread(member).getByRole('button', { name: '👍 1' }).click()
  await expect(thread(owner).getByRole('button', { name: '👍 2' })).toHaveAttribute('title', `${OWNER}, ${MEMBER}`)

  await Promise.all([owner.context().close(), member.context().close()])
})
