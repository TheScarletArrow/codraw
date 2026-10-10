import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, userPage, vertices } from './helpers.ts'

// Users of their own: other tests expect Алиса and Боб to have no workspaces and boards of theirs.
const OWNER = 'Зоя'
const EDITOR = 'Илья'

const sharing = (page: Page) => page.getByRole('dialog', { name: 'Поделиться доской' })

test('a team gets a board through its workspace, its access to the workspace limits an editor at once, and removing him closes the board to him', async ({
  browser,
}) => {
  const owner = await userPage(browser, OWNER)
  const editor = await userPage(browser, EDITOR)

  // The owner creates a workspace on the main page and lands on it.
  await owner.goto('/')
  await owner.getByRole('button', { name: 'Создать пространство' }).click()
  await owner.getByRole('textbox', { name: 'Название пространства' }).fill('Платформа')
  await owner.getByRole('textbox', { name: 'Название пространства' }).press('Enter')
  await expect(owner).toHaveURL(/\/workspaces\/[0-9a-f-]{36}$/)
  const workspaceUrl = owner.url()
  await expect(owner.getByRole('heading', { name: 'Платформа' })).toBeVisible()

  // An invitation of an editor brings Илья into the workspace.
  const members = owner.getByRole('region', { name: 'Участники' })
  await members.getByRole('combobox', { name: 'Роль приглашённых' }).selectOption('Редактор')
  await members.getByRole('button', { name: 'Создать ссылку' }).click()
  const invitation = await members.getByRole('textbox', { name: 'Ссылка-приглашение' }).inputValue()
  await editor.goto(invitation)
  await expect(editor).toHaveURL(workspaceUrl)
  await expect(editor.getByTitle('Ваша роль')).toHaveText('Редактор')

  // The owner brings a board of hers into the workspace from the list of boards.
  const url = await createBoard(owner)
  const boardId = url.split('/').pop()!
  await owner.goto('/')
  await owner.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await owner.getByRole('menuitem', { name: 'Перенести в пространство' }).click()
  const moved = owner.waitForResponse((response) => response.request().method() === 'PUT' && response.ok())
  await owner.getByRole('menuitem', { name: /Платформа/ }).click()
  await moved
  await expect(owner.locator(`a[href="/boards/${boardId}"]`)).toHaveCount(0)

  // Илья finds it in the workspace and edits it together with the owner.
  await editor.reload()
  await editor.getByRole('list', { name: 'Доски пространства' }).getByRole('link', { name: 'Новая доска' }).click()
  await expect(editor).toHaveURL(new RegExp(`/boards/${boardId}`))
  await expect(editor.getByRole('status')).toHaveText('Синхронизировано')
  await expect(editor.getByRole('link', { name: 'Платформа' })).toBeVisible()
  await owner.goto(url)
  await expect(owner.getByRole('status')).toHaveText('Синхронизировано')
  await addShape(editor, 'Прямоугольник')
  await expect.poll(async () => (await vertices(owner)).length).toBe(1)

  // The board came with its link open to editing: closed, it leaves Илья what the workspace gives him.
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  const closed = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await sharing(owner).getByRole('radio', { name: /Только я/ }).check()
  await closed
  await expect(editor.getByRole('status')).toHaveText('Синхронизировано')
  await expect(editor.getByText('Только просмотр')).toBeHidden()

  // The members of the workspace only view the board now: Илья loses editing without reloading.
  const access = sharing(owner).getByRole('group', { name: 'Доступ участникам пространства' })
  const limited = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await access.getByRole('radio', { name: /Просмотр/ }).check()
  await limited
  await expect(editor.getByText('Только просмотр')).toBeVisible()
  await owner.keyboard.press('Escape')

  // Taken out of the workspace, Илья no longer opens its boards; the board stays with the team.
  await owner.goto(workspaceUrl)
  const removed = owner.waitForResponse((response) => response.request().method() === 'DELETE' && response.ok())
  await owner.getByRole('button', { name: `Убрать: ${EDITOR}` }).click()
  await removed
  await expect(owner.getByRole('list', { name: 'Доски пространства' }).getByRole('link', { name: 'Новая доска' })).toBeVisible()
  await editor.goto(url)
  await expect(editor.getByRole('alert')).toContainText('Нет доступа')
  await editor.goto(workspaceUrl)
  await expect(editor.getByRole('heading', { name: 'Пространство не найдено' })).toBeVisible()

  await Promise.all([owner.context().close(), editor.context().close()])
})
