import { expect, test } from '@playwright/test'
import { addShape, cellBox, center, createBoard, csrfHeaders, openBoard, twoParticipants, userPage, vertices } from './helpers.ts'

test('a shape is found by the technology it stands for and added with Enter for everybody', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const palette = alice.getByRole('complementary', { name: 'Фигуры' })

  await palette.getByRole('searchbox', { name: 'Поиск фигур' }).fill('kafka')
  await expect(palette.getByRole('group', { name: 'Найденные фигуры' }).getByRole('button')).toHaveText(['Топик событий'])
  await palette.getByRole('searchbox', { name: 'Поиск фигур' }).press('Enter')

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual(['Топик событий'])
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value)).toEqual(['Топик событий'])

  await palette.getByRole('searchbox', { name: 'Поиск фигур' }).fill('zzz')
  await expect(palette.getByText('Ничего не найдено')).toBeVisible()
  await palette.getByRole('searchbox', { name: 'Поиск фигур' }).press('Escape')
  await expect(palette.getByRole('group', { name: 'C4' })).toBeVisible()

  await close()
})

test('? on the canvas and the button of the header open the shortcuts, ? in a label is a character', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const shape = await addShape(alice, 'Прямоугольник')
  const help = alice.getByRole('dialog', { name: 'Горячие клавиши' })

  await alice.keyboard.press('?')
  await expect(help).toBeVisible()
  await expect(help.getByRole('region', { name: 'Правка' })).toContainText('Дублировать')
  await expect(help.getByRole('region', { name: 'Вид' })).toContainText('Ctrl+Shift+H')
  await alice.keyboard.press('Escape')
  await expect(help).toBeHidden()

  await alice.getByRole('button', { name: 'Горячие клавиши' }).click()
  await expect(help).toBeVisible()
  await alice.keyboard.press('Escape')
  // The closed window gives the keyboard back to its button on a timeout; a label edited before that would lose it.
  await expect(help).toBeHidden()
  await expect(alice.getByRole('button', { name: 'Горячие клавиши' })).toBeFocused()

  await alice.mouse.dblclick(...(Object.values(center(await cellBox(alice, shape))) as [number, number]))
  // The keys go to the label once its editor has the keyboard.
  await expect(alice.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await alice.keyboard.type('Зачем?')
  await expect(help).toBeHidden()
  await alice.getByTestId('diagram-canvas').click({ position: { x: 40, y: 40 } })
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual(['Зачем?'])

  await alice.context().close()
})

test('a participant who may only view sees only the shortcuts they have', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)

  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await bob.getByRole('button', { name: 'Горячие клавиши' }).click()

  const help = bob.getByRole('dialog', { name: 'Горячие клавиши' })
  await expect(help).toContainText('Копировать')
  await expect(help).toContainText('Показать всё')
  await expect(help).not.toContainText('Удалить')
  await expect(help).not.toContainText('Дублировать')

  await Promise.all([alice.context().close(), bob.context().close()])
})
