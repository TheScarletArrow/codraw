import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, twoParticipants, userPage, vertices } from './helpers.ts'

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const linkWindow = (page: Page) => page.getByRole('dialog', { name: 'Ссылка' })
const badge = (page: Page, cellId: string) => page.locator(`[data-testid=link-badge][data-cell="${cellId}"]`)

/** The link of a shape as the participant has it. */
const linkOf = async (page: Page, id: string) => (await vertices(page)).find((cell) => cell.id === id)?.style.link

/** The id of the page that a participant has open. */
const openPageId = (page: Page) => new URL(page.url()).searchParams.get('page')

/** Opens the window «Ссылка» of a shape from the menu of a right click on it. */
async function openLinkWindow(page: Page, id: string) {
  const { x, y } = center(await cellBox(page, id))
  await page.mouse.click(x, y, { button: 'right' })
  await menu(page).getByRole('menuitem', { name: 'Ссылка…' }).click()
  await expect(linkWindow(page)).toBeVisible()
}

/** Clicks a shape with Ctrl, as on Windows and Linux. */
async function ctrlClick(page: Page, id: string) {
  const { x, y } = center(await cellBox(page, id))
  await page.keyboard.down('Control')
  await page.mouse.click(x, y)
  await page.keyboard.up('Control')
}

/** A board with a shape on «Страница 1» and an empty «Страница 2», with the first page open. */
async function boardOfTwoPages(page: Page) {
  await page.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(tab(page, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  const second = openPageId(page)!
  await tab(page, 'Страница 1').click()
  await expect(tab(page, 'Страница 1')).toHaveAttribute('aria-selected', 'true')
  const shape = await addShape(page, 'Прямоугольник')
  return { shape, first: openPageId(page)!, second }
}

test('a link to another page set in its window shows its badge to everybody, Ctrl+click goes there, Ctrl+Z takes it away', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const { shape, second } = await boardOfTwoPages(alice)

  await openLinkWindow(alice, shape)
  // The page after the current one is offered first.
  await expect(linkWindow(alice).getByRole('combobox', { name: 'Страница' })).toHaveValue(second)
  await linkWindow(alice).getByRole('button', { name: 'Сохранить' }).click()
  await expect(linkWindow(alice)).toBeHidden()

  await expect(badge(alice, shape)).toHaveAttribute('title', 'Страница «Страница 2»')
  await expect.poll(() => linkOf(bob, shape)).toBe(`data:page/id,${second}`)
  await expect(badge(bob, shape)).toHaveAccessibleName('Перейти по ссылке: Страница «Страница 2»')

  // Ctrl+click goes to the page and selects nothing on the way.
  await ctrlClick(bob, shape)
  await expect(tab(bob, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  expect(openPageId(bob)).toBe(second)

  // One undo step takes the link away, for everybody.
  await alice.keyboard.press('Control+z')
  await expect(badge(alice, shape)).toHaveCount(0)
  await tab(bob, 'Страница 1').click()
  await expect.poll(() => linkOf(bob, shape)).toBeUndefined()
  await expect(badge(bob, shape)).toHaveCount(0)

  await close()
})

test('an address opens in a new tab that knows nothing of the board, and javascript: is refused', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  const shape = await addShape(page, 'Прямоугольник')
  // The documentation of the test, without the internet.
  await page.context().route('https://docs.example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Документация</title>' }),
  )

  await openLinkWindow(page, shape)
  await linkWindow(page).getByRole('radio', { name: 'Адрес' }).check()
  const address = linkWindow(page).getByRole('textbox', { name: 'Адрес' })
  await address.fill('javascript:alert(document.cookie)')
  await address.press('Enter')
  await expect(linkWindow(page).getByRole('alert')).toHaveText('Адрес должен начинаться с http://, https:// или mailto:')
  expect(await linkOf(page, shape)).toBeUndefined()

  await address.fill('docs.example.com/payments')
  await address.press('Enter')
  await expect(badge(page, shape)).toHaveAttribute('title', 'https://docs.example.com/payments')

  const opened = page.context().waitForEvent('page')
  await badge(page, shape).click()
  const docs = await opened
  await docs.waitForURL('https://docs.example.com/payments')
  expect(await docs.evaluate(() => window.opener)).toBeNull()
  expect(await docs.evaluate(() => document.referrer)).toBe('')
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')

  // Ctrl+click on the shape opens it too.
  const again = page.context().waitForEvent('page')
  await ctrlClick(page, shape)
  await (await again).waitForURL('https://docs.example.com/payments')

  await page.context().close()
})

test('a link to a page goes to .drawio as a UserObject with data:page/id, and comes back from the file', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const { shape, second } = await boardOfTwoPages(alice)
  await openLinkWindow(alice, shape)
  await linkWindow(alice).getByRole('button', { name: 'Сохранить' }).click()
  await expect(badge(alice, shape)).toBeVisible()

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  const xml = await readFile((await file.path())!, 'utf8')

  expect(xml).toMatch(new RegExp(`<UserObject [^>]*link="data:page/id,${second}" id="${shape}"><mxCell [^>]*vertex="1"`))
  expect(xml).toContain(`<diagram id="${second}" name="Страница 2">`)

  // The file opens as a new board of another participant, whose pages keep their ids and the link its page.
  const eve = await userPage(browser, 'Ева')
  await eve.goto('/')
  await eve.getByLabel('Файл draw.io').setInputFiles({ name: 'Ссылки.drawio', mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(eve.getByRole('heading', { name: 'Ссылки', level: 2 })).toBeVisible()
  await expect(eve.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => linkOf(eve, shape)).toBe(`data:page/id,${second}`)
  await expect(badge(eve, shape)).toHaveAttribute('title', 'Страница «Страница 2»')
  await ctrlClick(eve, shape)
  await expect(tab(eve, 'Страница 2')).toHaveAttribute('aria-selected', 'true')

  await Promise.all([alice.context().close(), eve.context().close()])
})
