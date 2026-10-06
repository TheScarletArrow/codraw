import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, openBoard, userPage, vertices } from './helpers.ts'

const offline = 'Нет связи — правки сохраняются на этом устройстве'
const unsent = 'Не отправлено: есть правки'

/**
 * Waits until the local copy of the board in the browser has stored every change so far: a read of the copy runs after
 * the writes that came before it, so the page may close without losing them.
 */
async function copyStored(page: Page, boardId: string) {
  await page.evaluate(async (boardId) => {
    const name = (await indexedDB.databases()).find((database) => database.name?.endsWith(`:${boardId}`))?.name
    if (!name) throw new Error(`No local copy of board ${boardId}`)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const read = database.transaction('updates', 'readonly').objectStore('updates').count()
        read.onsuccess = () => {
          database.close()
          resolve()
        }
        read.onerror = () => reject(read.error)
      }
    })
  }, boardId)
}

test('a shape added without a connection in a closed tab reaches the other participant once the board is opened again', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = url.split('/').pop()!
  await openBoard(bob, url)

  await alice.context().setOffline(true)
  await expect(alice.getByRole('status')).toHaveText('Нет связи')
  await expect(alice.getByRole('note')).toHaveText(offline)
  const shape = await addShape(alice, 'Прямоугольник')
  await expect(alice.getByRole('note')).toHaveText(`${offline} · ${unsent}`)
  await copyStored(alice, boardId)
  await alice.close()

  // Nothing reached the other participant meanwhile.
  await new Promise((resolve) => setTimeout(resolve, 1000))
  expect(await vertices(bob)).toEqual([])

  await alice.context().setOffline(false)
  const again = await alice.context().newPage()
  await again.goto(url)
  // The board shows from the copy, then goes to the board.
  await expect.poll(async () => (await vertices(again)).map((cell) => cell.id)).toEqual([shape])
  await expect(again.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id)).toEqual([shape])

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('edits made without a connection reach the other participant once the connection is back, without a reload', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await openBoard(bob, url)
  const first = await addShape(alice, 'Прямоугольник')
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)

  await alice.context().setOffline(true)
  await expect(alice.getByRole('note')).toHaveText(offline)
  const second = await addShape(alice, 'Эллипс')
  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(alice.getByRole('note')).toHaveText(`${offline} · ${unsent}`)
  expect(await vertices(bob)).toHaveLength(1)

  await alice.context().setOffline(false)

  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await expect(alice.getByRole('note')).toBeHidden()
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id).sort()).toEqual([first, second].sort())
  await expect(bob.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')).toHaveCount(2)

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('edits made without a connection by a participant whose link now gives viewing stay on their device only', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await openBoard(bob, url)

  await bob.context().setOffline(true)
  await expect(bob.getByRole('note')).toHaveText(offline)
  await addShape(bob, 'Прямоугольник')
  await alice.getByRole('button', { name: 'Поделиться' }).click()
  const changed = alice.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await alice.getByRole('radio', { name: /Просмотр/ }).check()
  await changed
  await alice.keyboard.press('Escape')
  await bob.context().setOffline(false)

  const notice = bob.getByRole('alert')
  await expect(notice).toContainText('Правки, сделанные без связи, не отправлены: у вас больше нет права правки')
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await vertices(bob)).length).toBe(0)
  expect(await vertices(alice)).toEqual([])

  const download = bob.waitForEvent('download')
  await notice.getByRole('button', { name: 'Скачать копию (.drawio)' }).click()
  expect((await download).suggestedFilename()).toBe('Новая доска.drawio')
  await notice.getByRole('button', { name: 'Удалить копию с устройства' }).click()
  await notice.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(notice).toBeHidden()
  expect(await vertices(alice)).toEqual([])

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('edits made without a connection by a member made a viewer go to the board once the owner gives editing back on request', async ({
  browser,
}) => {
  // Users of their own: other tests count the members, requests and notifications of their users.
  const owner = await userPage(browser, 'Кира')
  const member = await userPage(browser, 'Лев')
  const url = await createBoard(owner)
  const sharing = owner.getByRole('dialog', { name: 'Поделиться доской' })
  const openSharing = async () => {
    await owner.getByRole('button', { name: /^Поделиться/ }).click()
    await expect(sharing.getByRole('list', { name: 'Участники доски' })).toBeVisible()
  }

  // The board is closed to others, and the member edits it through an invitation.
  await openSharing()
  const closed = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await sharing.getByRole('radio', { name: /Только я/ }).check()
  await closed
  const invites = sharing.getByRole('region', { name: 'Пригласить по ссылке' })
  await invites.getByRole('combobox', { name: 'Роль приглашённых' }).selectOption('Редактирование')
  await invites.getByRole('button', { name: 'Создать ссылку' }).click()
  const invitation = await invites.getByRole('textbox', { name: 'Ссылка-приглашение: Редактирование' }).inputValue()
  await owner.keyboard.press('Escape')
  await member.goto(invitation)
  await expect(member.getByRole('status')).toHaveText('Синхронизировано')

  // Without a connection the member adds a shape, and meanwhile the owner makes them a viewer.
  await member.context().setOffline(true)
  await expect(member.getByRole('note')).toHaveText(offline)
  const shape = await addShape(member, 'Прямоугольник')
  await openSharing()
  const roleChanged = owner.waitForResponse((response) => response.request().method() === 'PUT' && response.ok())
  await sharing.getByRole('combobox', { name: 'Роль: Лев' }).selectOption('Просмотр')
  await roleChanged
  await owner.keyboard.press('Escape')
  await member.context().setOffline(false)

  const notice = member.getByRole('alert')
  await expect(notice).toContainText('Правки, сделанные без связи, не отправлены: у вас больше нет права правки')
  await expect(member.getByText('Только просмотр')).toBeVisible()
  expect(await vertices(owner)).toEqual([])

  // The member asks for editing next to «Только просмотр», and the owner gives it: the copy goes to the board.
  await member.getByRole('button', { name: 'Запросить правку' }).click()
  await member.getByRole('dialog', { name: 'Запрос правки' }).getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(member.getByRole('button', { name: 'Запрос отправлен' })).toBeVisible()
  await member.keyboard.press('Escape')
  await openSharing()
  const request = sharing.getByRole('region', { name: 'Запросы доступа' }).getByRole('listitem', { name: 'Лев' })
  await request.getByRole('button', { name: 'Дать редактирование' }).click()
  await expect(sharing.getByRole('combobox', { name: 'Роль: Лев' })).toHaveValue('editor')

  await expect(member.getByText('Только просмотр')).toBeHidden({ timeout: 20_000 })
  await expect(notice).toBeHidden()
  await expect.poll(async () => (await vertices(owner)).map((cell) => cell.id)).toEqual([shape])
  await expect(member.getByRole('status')).toHaveText('Синхронизировано')

  await Promise.all([owner.context().close(), member.context().close()])
})
