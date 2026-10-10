import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, edges, twoParticipants, userPage, vertices } from './helpers.ts'

const arrow = (page: Page, where: string) => page.getByRole('button', { name: `Добавить фигуру ${where}` })
const shapeList = (page: Page) => page.getByRole('dialog', { name: 'Фигуры для связи' })
const relation = (page: Page) => page.getByRole('combobox', { name: 'Отношение связи' })

/** Adds a shape of `name` connected to the selected one on its right with quick connect, and returns its id. */
async function addConnected(page: Page, name: string): Promise<string> {
  const before = new Set((await vertices(page)).map((cell) => cell.id))
  await arrow(page, 'справа').click()
  await shapeList(page).getByRole('button', { name, exact: true }).click()
  await expect.poll(async () => (await vertices(page)).length).toBe(before.size + 1)
  return (await vertices(page)).find((cell) => !before.has(cell.id))!.id
}

/**
 * Clicks a straight edge, as a participant selects it, nearer its source: at its middle, the arrow of quick connect of
 * a selected target may cover it.
 */
async function clickEdge(page: Page, id: string) {
  const point = await page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as HTMLElement & Record<string, any>
    const { graph } = container.__codrawEditor
    const points = graph.getView().getState(graph.getDataModel().getCell(id)).absolutePoints
    const [a, b] = [points[0], points[points.length - 1]]
    const rect = container.getBoundingClientRect()
    const at = (from: number, to: number) => from + (to - from) * 0.3
    return { x: rect.left - container.scrollLeft + at(a.x, b.x), y: rect.top - container.scrollTop + at(a.y, b.y) }
  }, id)
  await page.mouse.click(point.x, point.y)
}

test('an actor connected to a use case is an association, and «Отношение» makes it an inclusion for both', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const actor = await addShape(alice, 'Актёр')

  await arrow(alice, 'справа').click()
  await expect(shapeList(alice).getByRole('button')).toHaveText(['Актёр', 'Вариант использования'])
  await shapeList(alice).getByRole('button', { name: 'Вариант использования' }).click()

  await expect.poll(async () => (await edges(bob)).map((edge) => [edge.source, edge.style.endArrow])).toEqual([[actor, 'none']])
  const [edge] = await edges(alice)
  await clickEdge(alice, edge!.id)
  await expect(relation(alice)).toHaveValue('association')

  await relation(alice).selectOption({ label: 'Включение «include»' })

  await expect.poll(async () => (await edges(bob))[0]).toMatchObject({
    value: '«include»',
    style: { dashed: true, endArrow: 'open' },
  })
  await alice.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await edges(bob))[0]).toMatchObject({ value: '', style: { endArrow: 'none' } })
  expect((await edges(bob))[0]!.style.dashed).toBeUndefined()

  await close()
})

test('a diagram of use cases goes to draw.io and comes back with its shapes and relations', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  await addShape(page, 'Актёр')
  const order = await addConnected(page, 'Вариант использования')
  const login = await addConnected(page, 'Вариант использования')
  const include = (await edges(page)).find((edge) => edge.source === order && edge.target === login)!
  await clickEdge(page, include.id)
  await relation(page).selectOption({ label: 'Включение «include»' })
  await expect.poll(async () => (await edges(page)).find((edge) => edge.id === include.id)?.value).toBe('«include»')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  const xml = await readFile((await file.path())!, 'utf8')
  expect(xml).toContain('shape=umlActor')
  expect(xml).toContain('endArrow=open')
  expect(xml).toContain('dashed=1')

  const other = await userPage(browser, 'Вера')
  await other.goto('/')
  await other.getByLabel('Файл draw.io').setInputFiles({
    name: file.suggestedFilename(),
    mimeType: 'application/vnd.jgraph.mxfile',
    buffer: Buffer.from(xml),
  })
  await expect(other.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await vertices(other)).map((cell) => cell.style.codrawShape).sort()).toEqual([
    'uml-actor',
    'uml-use-case',
    'uml-use-case',
  ])
  await clickEdge(other, include.id)
  await expect(relation(other)).toHaveValue('include')

  await Promise.all([page.context().close(), other.context().close()])
})
