import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, vertices } from './helpers.ts'

/** Palette name and the draw.io or `codraw.*` shape it is drawn with. */
const SHAPES: [string, string][] = [
  ['Балансировщик нагрузки', 'hexagon'],
  ['API-шлюз', 'process'],
  ['CDN', 'doubleEllipse'],
  ['Сервер', 'codraw.server'],
  ['Контейнер', 'cube'],
  ['Брандмауэр', 'codraw.firewall'],
  ['DNS', 'card'],
  ['Хранилище объектов', 'codraw.bucket'],
  ['Поисковый индекс', 'internalStorage'],
  ['Хранилище данных', 'datastore'],
  ['Топик событий', 'codraw.topic'],
  ['Планировщик задач', 'codraw.clock'],
  ['Функция', 'parallelogram'],
  ['Веб-браузер', 'codraw.browser'],
  ['Мобильное приложение', 'codraw.mobile'],
  ['Десктоп-приложение', 'codraw.desktop'],
  ['IoT-устройство', 'codraw.chip'],
  ['Компонент', 'component'],
  ['Интерфейс', 'ellipse'],
  ['Пакет', 'folder'],
  ['Заметка', 'note'],
]

/** Name of the maxGraph shape class that draws the cell, or `null` when it is not drawn. */
function drawnBy(page: Page, id: string) {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const shape = graph.getView().getState(graph.getDataModel().getCell(id))?.shape
    return shape?.node?.childNodes.length > 0 ? shape.constructor.name : null
  }, id)
}

test('system design shapes are added, drawn and shown to the other participant', async ({ browser }) => {
  test.slow()
  const { alice, bob, close } = await twoParticipants(browser)

  const ids: string[] = []
  for (const [name] of SHAPES) ids.push(await addShape(alice, name))

  await expect.poll(async () => (await vertices(bob)).length).toBe(SHAPES.length)
  const byId = new Map((await vertices(bob)).map((cell) => [cell.id, cell]))
  for (const [index, [name, shape]] of SHAPES.entries()) {
    expect(byId.get(ids[index]!), name).toMatchObject({ value: name, style: { shape } })
    // Drawn by a registered shape, not by the plain rectangle maxGraph falls back to.
    const drawn = await drawnBy(bob, ids[index]!)
    expect(drawn, name).not.toBeNull()
    expect(drawn, name).not.toBe('RectangleShape')
  }

  await close()
})

test('a click inside a Kubernetes cluster selects the shape under it', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const container = await addShape(alice, 'Контейнер')
  const cluster = await addShape(alice, 'Кластер Kubernetes')

  await alice.mouse.click(...(Object.values(center(await cellBox(alice, container))) as [number, number]))

  await expect
    .poll(() =>
      alice.evaluate(() => {
        const element = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
        return element.__codrawEditor.graph.getSelectionCell()?.getId() ?? null
      }),
    )
    .toBe(container)
  expect(cluster).not.toBe(container)

  await close()
})

test('a section of the palette collapses with a click on its title', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const palette = alice.getByRole('complementary', { name: 'Фигуры' })

  await palette.getByText('UML', { exact: true }).click()
  await expect(palette.getByRole('button', { name: 'Заметка' })).toBeHidden()

  await palette.getByText('UML', { exact: true }).click()
  await expect(palette.getByRole('button', { name: 'Заметка' })).toBeVisible()

  await close()
})
