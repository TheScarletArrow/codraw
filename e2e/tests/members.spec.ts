import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, csrfHeaders, openBoardList, userPage, vertices } from './helpers.ts'

// Users of their own: a member who becomes an owner gets boards, and other tests expect Алиса and Боб to have none of
// theirs or a list of shared boards of their own.
const OWNER = 'Вера'
const MEMBER = 'Глеб'

const palette = (page: Page) => page.getByRole('complementary', { name: 'Фигуры' })
const sharing = (page: Page) => page.getByRole('dialog', { name: 'Поделиться доской' })

/** Opens «Поделиться» and waits for the participants of the board. */
async function openSharing(page: Page) {
  await page.getByRole('button', { name: 'Поделиться' }).click()
  await expect(sharing(page).getByRole('list', { name: 'Участники доски' })).toBeVisible()
}

test('an invited editor edits a board closed to others, becomes a viewer at once, then its owner, and the previous owner keeps the history', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const member = await userPage(browser, MEMBER)
  const url = await createBoard(owner)
  const boardId = url.split('/').pop()!

  // Nobody but the owner opens the board through its link, and the owner invites to edit it.
  await openSharing(owner)
  const closed = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await sharing(owner).getByRole('radio', { name: /Только я/ }).check()
  await closed
  const invites = sharing(owner).getByRole('region', { name: 'Пригласить по ссылке' })
  await invites.getByRole('combobox', { name: 'Роль приглашённых' }).selectOption('Редактирование')
  await invites.getByRole('button', { name: 'Создать ссылку' }).click()
  const invitation = await invites.getByRole('textbox', { name: 'Ссылка-приглашение: Редактирование' }).inputValue()
  await owner.keyboard.press('Escape')

  // The invitation opens the board, which the member edits together with the owner.
  await member.goto(invitation)
  await expect(member).toHaveURL(new RegExp(`/boards/${boardId}`))
  await expect(member.getByRole('status')).toHaveText('Синхронизировано')
  await addShape(member, 'Прямоугольник')
  await expect.poll(async () => (await vertices(owner)).length).toBe(1)

  // A viewer now: the member loses editing without reloading.
  await openSharing(owner)
  const memberRow = sharing(owner).getByRole('listitem', { name: MEMBER })
  const roleChanged = owner.waitForResponse((response) => response.request().method() === 'PUT' && response.ok())
  await memberRow.getByRole('combobox', { name: `Роль: ${MEMBER}` }).selectOption('Просмотр')
  await roleChanged
  await expect(member.getByText('Только просмотр')).toBeVisible()
  await expect(palette(member)).toBeHidden()
  await expect(member.getByRole('status')).toHaveText('Синхронизировано')

  // The owner gives the board to the member.
  await memberRow.getByRole('button', { name: 'Сделать владельцем' }).click()
  await sharing(owner).getByRole('alertdialog', { name: 'Передача владения' }).getByRole('button', { name: 'Сделать владельцем' }).click()

  // The new owner edits and manages the board without reloading: its title, its link, its members.
  await expect(member.getByText('Только просмотр')).toBeHidden()
  await expect(palette(member)).toBeVisible()
  await expect(member.getByRole('button', { name: 'Новая доска', exact: true })).toBeVisible()
  await openSharing(member)
  await expect(sharing(member).getByRole('radio', { name: /Только я/ })).toBeChecked()
  await expect(sharing(member).getByRole('combobox', { name: `Роль: ${OWNER}` })).toHaveValue('editor')
  await member.keyboard.press('Escape')

  // The previous owner edits the board and keeps its history of versions, but renames nothing.
  await owner.keyboard.press('Escape')
  await expect(owner.getByRole('button', { name: 'Новая доска', exact: true })).toHaveCount(0)
  await owner.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await expect(owner.getByRole('menuitem')).toHaveText(['Создать копию', 'История версий'])
  await owner.getByRole('menuitem', { name: 'История версий' }).click()
  const history = owner.getByRole('complementary', { name: 'История версий' })
  await history.getByRole('button', { name: 'Сохранить версию' }).click()
  await expect(history.getByRole('button', { name: /Вручную/ })).toHaveCount(1)
  await addShape(owner, 'Эллипс')
  await expect.poll(async () => (await vertices(member)).length).toBe(2)

  // The board is among the own boards of the new owner, and shared with the previous one.
  expect(await openBoardList(owner)).toContain(boardId)
  await expect(owner.getByRole('region', { name: 'Общие со мной' }).locator(`a[href="/boards/${boardId}"]`)).toBeVisible()
  expect(await openBoardList(member)).not.toContain(boardId)
  await expect(member.locator(`a[href="/boards/${boardId}"]`)).toBeVisible()

  await Promise.all([owner.context().close(), member.context().close()])
})

test('a visitor without a session continues as a guest from an invitation, and a revoked invitation is not valid', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const url = await createBoard(owner)
  const boardId = url.split('/').pop()!
  const headers = await csrfHeaders(owner.request)
  expect((await owner.request.patch(`/api/boards/${boardId}`, { data: { linkAccess: 'none' }, headers })).ok()).toBe(true)
  const created = await owner.request.post(`/api/boards/${boardId}/invites`, { data: { role: 'viewer' }, headers })
  const { path } = (await created.json()) as { path: string }

  const guest = await (await browser.newContext()).newPage()
  await guest.goto(path)
  await expect(guest).toHaveURL(/\/login$/)
  await guest.getByRole('button', { name: 'Продолжить без входа' }).click()

  await expect(guest).toHaveURL(new RegExp(`/boards/${boardId}`))
  await expect(guest.getByRole('status')).toHaveText('Синхронизировано')
  await expect(guest.getByText('Только просмотр')).toBeVisible()
  expect(await openBoardList(guest)).toContain(boardId)

  // Revoking the invitation keeps the guest a member, but the link no longer works.
  await openSharing(owner)
  await expect(sharing(owner).getByRole('listitem', { name: /^Гость \d+$/ })).toBeVisible()
  const invites = sharing(owner).getByRole('region', { name: 'Пригласить по ссылке' })
  await invites.getByRole('button', { name: 'Отозвать' }).click()
  await expect(invites.getByRole('listitem')).toHaveCount(0)

  await guest.goto(path)
  await expect(guest.getByRole('heading', { name: 'Приглашение недействительно' })).toBeVisible()
  await guest.goto(url)
  await expect(guest.getByRole('status')).toHaveText('Синхронизировано')

  await Promise.all([owner.context().close(), guest.context().close()])
})
