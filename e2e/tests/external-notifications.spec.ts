import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, csrfHeaders, openBoard, userPage } from './helpers.ts'

// Users of their own: the bells and letters of the users of other tests are theirs.
const AUTHOR = 'Ярослава'
const RECIPIENT = 'Глеб'

/** The backend of the tests sends the queue every second, without the minute of waiting of an installation. */
const DELIVERY_TIMEOUT = 15_000

interface Letter {
  to: string
  subject: string
  text: string
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const emailForm = (page: Page) => page.getByRole('form', { name: 'Почта' })
const chatForm = (page: Page) => page.getByRole('form', { name: 'Чат' })

/** The letters that the backend of the `e2e` profile keeps instead of sending them. */
async function letters(page: Page, to: string): Promise<Letter[]> {
  const response = await page.request.get(`/api/e2e/emails?to=${encodeURIComponent(to)}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Letter[]
}

/** Opens «Уведомления вне CoDraw» from the bell, as users find it. */
async function openSettings(page: Page) {
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: /^Уведомления/ }).click()
  await page.getByRole('dialog', { name: 'Уведомления' }).getByRole('link', { name: 'Настройки уведомлений' }).click()
  await expect(page.getByRole('heading', { name: 'Уведомления вне CoDraw', level: 1 })).toBeVisible()
}

/** Comments on a new shape of the board of the author and mentions the recipient in the comment. */
async function mentionOnNewShape(author: Page, text: string) {
  const shape = await addShape(author, 'Прямоугольник')
  const box = await cellBox(author, shape)
  await author.mouse.click(center(box).x, center(box).y, { button: 'right' })
  await author.getByRole('menu', { name: 'Действия' }).getByRole('menuitem', { name: 'Комментировать' }).click()
  const field = panel(author).getByRole('combobox', { name: 'Новый комментарий' })
  await field.pressSequentially('@Гл')
  await author.getByRole('option', { name: RECIPIENT }).click()
  await field.pressSequentially(text)
  await field.press('Enter')
  await expect(panel(author).getByRole('group', { name: 'Новая ветка' })).toBeHidden()
}

test('a participant confirms an address, gets a letter about a mention that leads to the thread, and mutes the board', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  // Every run confirms a new address: earlier runs on the same database leave their letters and channels.
  const address = `gleb-${Date.now()}@example.com`
  const author = await userPage(browser, AUTHOR)
  const recipient = await userPage(browser, RECIPIENT)

  // Глеб saves his address and opens the link of the letter that confirms it.
  await openSettings(recipient)
  await emailForm(recipient).getByRole('textbox', { name: 'Адрес' }).fill(address)
  await emailForm(recipient).getByRole('button', { name: 'Сохранить' }).click()
  await expect(emailForm(recipient)).toContainText(`Адрес не подтверждён — откройте ссылку из письма, отправленного на ${address}`)
  const [confirmation] = await letters(recipient, address)
  expect(confirmation!.subject).toBe('Подтвердите адрес для уведомлений CoDraw')
  const link = /(http\S+\/settings\/notifications\?confirm=\S+)/.exec(confirmation!.text)![1]!
  await recipient.goto(link)
  await expect(recipient.getByRole('status')).toHaveText('Адрес подтверждён: уведомления будут приходить на почту')
  await expect(emailForm(recipient)).toContainText('Адрес подтверждён')
  expect(new URL(recipient.url()).searchParams.has('confirm')).toBe(false)

  // Ярослава mentions Глеб on her board, which he opened through its link.
  const url = await createBoard(author)
  await openBoard(recipient, url)
  await recipient.goto('/')
  await mentionOnNewShape(author, 'посмотри схему')

  // The letter comes with the words of the bell and leads to the thread.
  await expect.poll(async () => (await letters(recipient, address)).length, { timeout: DELIVERY_TIMEOUT }).toBe(2)
  const mention = (await letters(recipient, address))[1]!
  expect(mention.subject).toBe(`${AUTHOR}: упоминание в «Новая доска»`)
  expect(mention.text).toContain(`@${RECIPIENT} посмотри схему`)
  const threadLink = /Открыть в CoDraw: (\S+)/.exec(mention.text)![1]!
  expect(new URL(threadLink).searchParams.has('thread')).toBe(true)
  await recipient.goto(threadLink)
  await expect(recipient.getByRole('status')).toHaveText('Синхронизировано')
  await expect(panel(recipient).getByRole('article')).toContainText('посмотри схему')

  // Глеб stops the notifications of the board: the next mention stays in the bell.
  await recipient.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await recipient.getByRole('menuitem', { name: 'Не присылать уведомления' }).click()
  await mentionOnNewShape(author, 'и это тоже')
  const boardId = new URL(url).pathname.split('/').pop()!
  await expect
    .poll(async () => {
      const response = await recipient.request.get('/api/notifications')
      const { notifications } = (await response.json()) as { notifications: { boardId: string; snippet: string }[] }
      return notifications.some((notification) => notification.boardId === boardId && notification.snippet.includes('и это тоже'))
    })
    .toBe(true)
  // The queue goes every second: a letter would have come by now.
  await recipient.waitForTimeout(3_000)
  expect(await letters(recipient, address)).toHaveLength(2)

  await openSettings(recipient)
  const muted = recipient.getByRole('list', { name: 'Доски без уведомлений' })
  await expect(muted.getByRole('link', { name: 'Новая доска' })).toBeVisible()
  await muted.getByRole('button', { name: 'Присылать снова: Новая доска' }).click()
  await expect(muted).toBeHidden()
})

test('a webhook of a chat gets the test message, and its address does not come back', async ({ browser }) => {
  const messages: string[] = []
  const server: Server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    request.on('end', () => {
      messages.push((JSON.parse(body) as { text: string }).text)
      response.writeHead(200).end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as AddressInfo
    const recipient = await userPage(browser, RECIPIENT)
    await openSettings(recipient)

    await chatForm(recipient).getByRole('textbox', { name: 'Адрес входящего вебхука' }).fill(`http://localhost:${port}/hooks/T1/B2/secret-9876`)
    await chatForm(recipient).getByRole('button', { name: 'Сохранить' }).click()
    await expect(chatForm(recipient)).toContainText('Сейчас: http://localhost/…9876')
    await expect(chatForm(recipient).getByRole('textbox', { name: 'Адрес входящего вебхука' })).toHaveValue('')

    await chatForm(recipient).getByRole('button', { name: 'Проверить' }).click()
    await expect(chatForm(recipient).getByRole('status')).toHaveText('Пробное сообщение отправлено')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('CoDraw: уведомления будут приходить сюда')

    const settings = await recipient.request.get('/api/notification-settings')
    expect(await settings.text()).not.toContain('secret-9876')

    // The chat of Глеб goes with this test: other runs get theirs.
    const removed = await recipient.request.delete('/api/notification-settings/webhook', { headers: await csrfHeaders(recipient.request) })
    expect(removed.status()).toBe(204)
  } finally {
    server.close()
  }
})
