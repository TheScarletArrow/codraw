import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, createBoard, csrfHeaders, edges, openBoard, userPage, vertices } from './helpers.ts'

const palette = (page: Page) => page.getByRole('complementary', { name: 'Фигуры' })
const libraries = (page: Page) => palette(page).getByRole('region', { name: 'Мои библиотеки' })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

/** A user of this test alone: test users keep what earlier tests left them, and libraries belong to their user. */
const fresh = (name: string) => `${name} ${Date.now()}`

/** Moves a shape by dragging it by a point near its top-left corner. */
async function move(page: Page, id: string, dx: number, dy: number) {
  const box = await cellBox(page, id)
  await page.mouse.move(box.x + 15, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 15 + dx / 2, box.y + 10 + dy / 2, { steps: 5 })
  await page.mouse.move(box.x + 15 + dx, box.y + 10 + dy, { steps: 5 })
  await page.mouse.up()
}

/** Selects the cell through the editor the app exposes on the canvas: copies may lie over it on the screen. */
function select(page: Page, id: string) {
  return page.evaluate((id) => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    graph.setSelectionCell(graph.getDataModel().getCell(id))
  }, id)
}

const count = async (page: Page) => ({ vertices: (await vertices(page)).length, edges: (await edges(page)).length })

test('a group with its edge saved into a library goes onto a board as independent copies that others see, which replacing and deleting it keep', async ({
  browser,
}) => {
  const alice = await userPage(browser, fresh('Алиса'))
  const bob = await userPage(browser, fresh('Боб'))
  const url = await createBoard(alice)
  await openBoard(bob, url)
  const service = await addShape(alice, 'Сервис')
  const database = await addShape(alice, 'База данных')
  await move(alice, database, 250, 0)
  await connect(alice, service, database)
  await expect.poll(() => count(alice)).toEqual({ vertices: 2, edges: 1 })

  // Алиса saves both shapes with their edge into a new library from the menu of the selection.
  await expect(libraries(alice)).toContainText('Выделите фигуры на холсте')
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+a')
  const at = center(await cellBox(alice, service))
  await alice.mouse.click(at.x, at.y, { button: 'right' })
  await menu(alice).getByRole('menuitem', { name: 'Сохранить в библиотеку…' }).click()
  const dialog = alice.getByRole('dialog', { name: 'Сохранить в библиотеку' })
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('Сервис с БД')
  await dialog.getByRole('textbox', { name: 'Название библиотеки' }).fill('Платежи')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()
  const payments = libraries(alice).getByRole('group', { name: 'Платежи' })
  await expect(payments.getByRole('button', { name: 'Сервис с БД', exact: true })).toBeVisible()
  // The library is Алиса's: Боб on the same board does not have it.
  await expect(libraries(bob)).toContainText('Выделите фигуры на холсте')

  // Two copies: their own cells, which Боб sees, each copy one undo step.
  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await payments.getByRole('button', { name: 'Сервис с БД', exact: true }).click()
  await expect.poll(() => count(alice)).toEqual({ vertices: 4, edges: 2 })
  await payments.getByRole('button', { name: 'Сервис с БД', exact: true }).click()
  await expect.poll(() => count(bob)).toEqual({ vertices: 6, edges: 3 })
  const ids = (await vertices(alice)).map((cell) => cell.id)
  expect(new Set(ids).size).toBe(6)
  const copy = (await vertices(alice)).filter((cell) => cell.value === 'Сервис').at(-1)!
  const line = (await edges(alice)).at(-1)!
  expect([line.source, line.target]).toContain(copy.id)
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(() => count(bob)).toEqual({ vertices: 4, edges: 2 })

  // The search finds the component first, and Enter adds it.
  await palette(alice).getByRole('searchbox', { name: 'Поиск фигур' }).fill('сервис с')
  await expect(palette(alice).getByRole('group', { name: 'Найденные фигуры' }).getByRole('button').first()).toHaveText('Сервис с БД')
  await palette(alice).getByRole('searchbox', { name: 'Поиск фигур' }).press('Enter')
  await expect.poll(() => count(bob)).toEqual({ vertices: 6, edges: 3 })
  await palette(alice).getByRole('searchbox', { name: 'Поиск фигур' }).press('Escape')

  // Replacing the component with a single shape keeps the copies; the next copy is the shape alone.
  await select(alice, service)
  await payments.getByRole('button', { name: 'Меню компонента «Сервис с БД»' }).click()
  const replaced = alice.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/components/'))
  await alice.getByRole('menuitem', { name: 'Заменить выделенным' }).click()
  expect((await replaced).status()).toBe(200)
  await expect.poll(() => count(alice)).toEqual({ vertices: 6, edges: 3 })
  await openBoard(alice, url)
  await payments.getByRole('button', { name: 'Сервис с БД', exact: true }).click()
  await expect.poll(() => count(bob)).toEqual({ vertices: 7, edges: 3 })

  // Deleting it keeps the copies too.
  await payments.getByRole('button', { name: 'Меню компонента «Сервис с БД»' }).click()
  await alice.getByRole('menuitem', { name: 'Удалить' }).click()
  await alice.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
  await expect(payments.getByRole('button', { name: 'Сервис с БД', exact: true })).toBeHidden()
  expect(await count(bob)).toEqual({ vertices: 7, edges: 3 })

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('an SVG added to a library is cleaned, goes onto a board as a vector picture and into .drawio', async ({ browser }) => {
  const alice = await userPage(browser, fresh('Алиса'))
  await createBoard(alice)
  await libraries(alice).getByRole('button', { name: 'Новая библиотека' }).click()
  await libraries(alice).getByRole('textbox', { name: 'Название новой библиотеки' }).fill('Логотипы')
  await libraries(alice).getByRole('textbox', { name: 'Название новой библиотеки' }).press('Enter')
  const logos = libraries(alice).getByRole('group', { name: 'Логотипы' })
  await expect(logos).toContainText('Пусто')

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" onload="alert(1)"><script>alert(1)</script><rect width="120" height="40" fill="#e11d48"/></svg>'
  await libraries(alice).getByLabel('Изображения для библиотеки «Логотипы»').setInputFiles([
    { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('просто текст') },
  ])
  await expect(logos.getByRole('button', { name: 'logo', exact: true })).toBeVisible()
  await expect(libraries(alice).getByRole('alert')).toContainText('«notes.txt»: Формат не поддерживается')

  await logos.getByRole('button', { name: 'logo', exact: true }).click()
  await expect.poll(async () => (await vertices(alice)).length).toBe(1)
  const [shape] = await vertices(alice)
  expect(shape!).toMatchObject({ width: 120, height: 40 })
  const image = String(shape!.style.image)
  expect(image.startsWith('data:image/svg+xml;base64,')).toBe(true)
  const written = Buffer.from(image.split(',')[1]!, 'base64').toString('utf8')
  expect(written).toContain('#e11d48')
  expect(written).not.toMatch(/script|onload/)

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const xml = await readFile((await (await download).path())!, 'utf8')
  expect(xml).toContain(`image=data:image/svg+xml,${image.split(',')[1]}`)

  await alice.context().close()
})

test('a library of another user and its components answer 404, and an unsafe SVG is refused', async ({ browser }) => {
  const alice = await userPage(browser, fresh('Алиса'))
  const bob = await userPage(browser, fresh('Боб'))
  const headers = await csrfHeaders(alice.request)
  const library = await alice.request.post('/api/libraries', { data: { name: 'Секретная' }, headers })
  expect(library.status()).toBe(201)
  const libraryId = ((await library.json()) as { id: string }).id
  const diagram = (style: string) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="" style="${style}" vertex="1" parent="1"><mxGeometry width="10" height="10" as="geometry"/></mxCell></root></mxGraphModel>`
  const component = await alice.request.post(`/api/libraries/${libraryId}/components`, {
    data: { name: 'Схема', content: diagram('rounded=1;') },
    headers,
  })
  expect(component.status()).toBe(201)
  const componentId = ((await component.json()) as { id: string }).id

  const unsafe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')
  const refused = await alice.request.post(`/api/libraries/${libraryId}/components`, {
    data: { name: 'Скрипт', content: diagram(`shape=image;image=data:image/svg+xml,${unsafe};`) },
    headers,
  })
  expect(refused.status()).toBe(415)

  expect((await bob.request.get(`/api/libraries/${libraryId}/components/${componentId}`)).status()).toBe(404)
  expect((await bob.request.delete(`/api/libraries/${libraryId}`, { headers: await csrfHeaders(bob.request) })).status()).toBe(404)
  expect(await (await bob.request.get('/api/libraries')).json()).toEqual([])
  expect((await alice.request.get(`/api/libraries/${libraryId}/components/${componentId}`)).status()).toBe(200)

  await Promise.all([alice.context().close(), bob.context().close()])
})
