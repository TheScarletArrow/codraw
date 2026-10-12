import { expect, test, type Page } from '@playwright/test'
import { addShape, twoParticipants, userPage } from './helpers.ts'

/** The test user whom the `e2e` profile of the backend makes an administrator of the installation. */
const ADMIN = 'Админ'

interface Stats {
  activeUsers: { days: number; accounts: number }[]
  periods: { days: number; editedBoards: number; coEditedBoards: number }[]
}

async function stats(admin: Page): Promise<Stats> {
  const response = await admin.request.get('/api/admin/stats')
  expect(response.status()).toBe(200)
  return (await response.json()) as Stats
}

const coEditedThisWeek = async (admin: Page) => (await stats(admin)).periods.find((period) => period.days === 7)!.coEditedBoards

test('two users editing a board together reach the statistics of the administrator', async ({ browser }) => {
  const admin = await userPage(browser, ADMIN)
  // Test data outlive the runs, and the tests run one at a time: the new board of this test adds one.
  const before = await coEditedThisWeek(admin)
  const { alice, close } = await twoParticipants(browser)

  await addShape(alice, 'Прямоугольник')

  await expect.poll(() => coEditedThisWeek(admin)).toBe(before + 1)
  expect((await stats(admin)).activeUsers.find((users) => users.days === 1)!.accounts).toBeGreaterThanOrEqual(3)
  await admin.goto('/')
  await admin.getByRole('link', { name: 'Администрирование' }).click()
  await admin.getByRole('tab', { name: 'Статистика' }).click()
  const collaboration = admin.getByRole('table', { name: 'Совместная работа' })
  await expect(collaboration.getByRole('row', { name: /^Доски, которые правили вместе/ })).toContainText(String(before + 1))
  await Promise.all([close(), admin.context().close()])
})
