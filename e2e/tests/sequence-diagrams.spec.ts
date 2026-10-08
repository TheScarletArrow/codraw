import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, cells, createBoard, twoParticipants, userPage } from './helpers.ts'

interface Part {
  id: string
  kind: string
  value: string
  y: number
}

/** The sequence diagram of the page with its parts in the order of the cells; `null` without one. */
function diagram(page: Page): Promise<{ id: string; title: string; parts: Part[] } | null> {
  return page.evaluate(() => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const found = graph
      .getDefaultParent()
      .getChildren()
      .find((cell: any) => cell.getStyle().shape === 'codraw.sequence')
    if (!found) return null
    return {
      id: found.getId(),
      title: String(found.getValue() ?? ''),
      parts: found.getChildren().map((cell: any) => ({
        id: cell.getId(),
        kind: String(cell.getStyle().codrawSeq ?? ''),
        value: String(cell.getValue() ?? ''),
        y: cell.getGeometry().y,
      })),
    }
  })
}

/** The texts of the parts of a kind from top to bottom, or from left to right for participants. */
async function texts(page: Page, kind: string) {
  const found = await diagram(page)
  return (found?.parts ?? []).filter((part) => part.kind === kind).sort((a, b) => a.y - b.y).map((part) => part.value)
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Инструменты' })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

const SEQUENCE = `sequenceDiagram
  autonumber
  actor U as Пользователь
  participant App as Приложение
  participant DB@{ "type": "database" }
  U->>+App: Войти
  alt есть сессия
    App-->>U: Страница
  else нет сессии
    App->>DB: Найти пользователя
    App-->>-U: Вход
  end
  Note over U,App: cookie`

test('a sequence diagram: added for both, a message inserted in the middle, Enter for the next ones, undo', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await addShape(alice, 'Диаграмма последовательности')
  await expect.poll(() => texts(bob, 'message')).toEqual(['Запрос', 'Ответ'])
  await expect.poll(() => texts(bob, 'participant')).toEqual(['Клиент', 'Сервис'])

  // Алиса selects «Запрос» and adds a message under it, then two more with Enter; Escape leaves no empty one.
  const request = (await diagram(alice))!.parts.find((part) => part.value === 'Запрос')!
  const at = center(await cellBox(alice, request.id))
  await alice.mouse.click(at.x, at.y)
  await toolbar(alice).getByRole('button', { name: 'Сообщение', exact: true }).click()
  await alice.keyboard.type('Проверка')
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Подпись')
  await alice.keyboard.press('Enter')
  await alice.keyboard.press('Escape')
  // «Подпись», written last, is selected again: the tools of the diagram stay.
  await expect(toolbar(alice).getByRole('button', { name: 'Сообщение', exact: true })).toBeVisible()

  await expect.poll(() => texts(bob, 'message')).toEqual(['Запрос', 'Проверка', 'Подпись', 'Ответ'])
  await expect.poll(() => texts(alice, 'message')).toEqual(['Запрос', 'Проверка', 'Подпись', 'Ответ'])
  // Laid out one under another at Боб too.
  const rows = (await diagram(bob))!.parts.filter((part) => part.kind === 'message').map((part) => part.y)
  expect(new Set(rows).size).toBe(4)

  // One undo step takes «Подпись» away with its text.
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(() => texts(bob, 'message')).toEqual(['Запрос', 'Проверка', 'Ответ'])

  // Боб numbers the messages; Алиса sees the numbers.
  const { id } = (await diagram(bob))!
  const box = await cellBox(bob, id)
  await bob.mouse.click(box.x + box.width - 6, box.y + box.height - 6)
  await toolbar(bob).getByRole('button', { name: 'Нумерация' }).click()
  await expect
    .poll(() =>
      alice.evaluate((diagramId) => {
        const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
        const { graph } = container.__codrawEditor
        const found = graph.getDataModel().getCell(diagramId)
        return found
          .getChildren()
          .filter((cell: any) => cell.getStyle().codrawSeq === 'message')
          .sort((a: any, b: any) => a.getGeometry().y - b.getGeometry().y)
          .map((cell: any) => graph.getLabel(cell))
      }, id),
    )
    .toEqual(['1. Запрос', '2. Проверка', '3. Ответ'])

  await close()
})

test('Mermaid of a sequence diagram pasted on the canvas becomes a diagram, which the menu copies back', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await alice.evaluate((text) => navigator.clipboard.writeText(text), SEQUENCE)

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+v')

  await expect.poll(() => texts(bob, 'participant')).toEqual(['Пользователь', 'Приложение', 'DB'])
  await expect.poll(() => texts(bob, 'message')).toEqual(['Войти', 'Страница', 'Найти пользователя', 'Вход'])
  expect(await texts(bob, 'frame')).toEqual(['есть сессия'])
  expect(await texts(bob, 'else')).toEqual(['нет сессии'])
  expect(await texts(bob, 'note')).toEqual(['cookie'])

  // The menu of a participant copies the whole diagram as Mermaid.
  const app = (await diagram(alice))!.parts.find((part) => part.value === 'Приложение')!
  const at = center(await cellBox(alice, app.id))
  await alice.mouse.click(at.x, at.y, { button: 'right' })
  await expect(menu(alice).getByRole('menuitem', { name: 'Удалить участника' })).toBeVisible()
  await menu(alice).getByRole('menuitem', { name: 'Скопировать Mermaid' }).click()
  await expect.poll(() => alice.evaluate(() => navigator.clipboard.readText())).toContain('sequenceDiagram')
  const copied = await alice.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('autonumber')
  expect(copied).toContain('actor Пользователь')
  expect(copied).toContain('Пользователь->>+Приложение: Войти')
  expect(copied).toContain('else нет сессии')

  // One undo step takes the whole diagram away.
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('a sequence diagram goes to .drawio as lifelines, frames and edges of draw.io, and comes back as ordinary shapes', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addShape(alice, 'Диаграмма последовательности')
  await expect.poll(() => texts(alice, 'message')).toEqual(['Запрос', 'Ответ'])

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  const xml = await readFile((await file.path())!, 'utf8')
  expect(xml.match(/shape=umlLifeline/g)).toHaveLength(2)
  expect(xml).toContain('shape=umlFrame')
  expect(xml).toContain('endArrow=block')
  expect(xml).not.toContain('codraw.sequence')

  // Another user opens the file as a board of their own: lifelines and edges between them.
  const eve = await userPage(browser, 'Ева')
  await eve.goto('/')
  await eve
    .getByLabel('Файл draw.io')
    .setInputFiles({ name: 'Сценарий входа.drawio', mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(eve.getByRole('status')).toHaveText('Синхронизировано')
  await expect
    .poll(() =>
      eve.evaluate(() => {
        const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
        const { graph } = container.__codrawEditor
        const all: any[] = []
        const visit = (parent: any) =>
          parent.getChildren().forEach((cell: any) => {
            all.push(cell)
            visit(cell)
          })
        visit(graph.getDefaultParent())
        return {
          lifelines: all.filter((cell) => cell.getStyle().shape === 'umlLifeline').map((cell) => cell.getValue()),
          edges: all.filter((cell) => cell.isEdge()).map((cell) => [cell.getValue(), Boolean(cell.getTerminal(true)), Boolean(cell.getTerminal(false))]),
        }
      }),
    )
    .toEqual({
      lifelines: ['Клиент', 'Сервис'],
      edges: [
        ['Запрос', true, true],
        ['Ответ', true, true],
      ],
    })

  await Promise.all([alice.context().close(), eve.context().close()])
})
