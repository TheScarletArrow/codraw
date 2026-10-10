import { expect, test } from '@playwright/test'
import { createBoard, edges, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

/** A workspace of Structurizr: a shop with two containers, a customer, an external payment system and deployment. */
const WORKSPACE = `workspace "Магазин" {
    !identifiers hierarchical
    model {
        !include people.dsl
        customer = person "Покупатель" "Выбирает товары"
        shop = softwareSystem "Магазин" {
            web = container "Сайт" "Каталог и корзина" "React"
            api = container "API" "Заказы" "Spring Boot"
        }
        payments = softwareSystem "Платежи" "" "External"
        customer -> shop "Покупает"
        customer -> shop.web "Открывает" "HTTPS"
        shop.web -> shop.api "Вызывает" "JSON/HTTPS"
        shop.api -> payments "Проводит оплату"
        live = deploymentEnvironment "Live" {
            deploymentNode "k8s" {
                containerInstance shop.api
            }
        }
    }
    views {
        systemLandscape {
            include *
            autolayout lr
        }
    }
}
`

const SHOP = 'Магазин\n[Software System]'
const WEB = 'Сайт\n[Container: React]\nКаталог и корзина'
const API = 'API\n[Container: Spring Boot]\nЗаказы'
const CUSTOMER = 'Покупатель\n[Person]\nВыбирает товары'
const PAYMENTS = 'Платежи\n[Software System]'

const inside = (frame: CellInfo, shape: CellInfo) =>
  shape.x >= frame.x && shape.y >= frame.y && shape.x + shape.width <= frame.x + frame.width && shape.y + shape.height <= frame.y + frame.height

test('a workspace of Structurizr becomes a system with its containers, people and relations for everybody, and is undone in one step', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт архитектуры как кода…' }).click()
  await menu.getByLabel('Файлы архитектуры').setInputFiles([{ name: 'workspace.dsl', mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE) }])
  await expect(menu.getByRole('status')).toHaveText('Элементов: 4, границ: 1, связей: 3')
  const warnings = menu.getByRole('list', { name: 'Предупреждения' })
  await expect(warnings).toContainText('workspace.dsl: строка 4 — !include people.dsl не выполняется: откройте этот файл вместе с остальными')
  await expect(warnings).toContainText('workspace.dsl: строка 15 — развёртывание «Live» не переносится')
  await expect(warnings).toContainText('Связей с раскрытыми элементами не нарисовано: 1 — их показывают связи частей: customer → shop')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value).sort()).toEqual([SHOP, WEB, API, CUSTOMER, PAYMENTS].sort())
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue(SHOP).style).toMatchObject({ codrawShape: 'c4-boundary', codrawKind: 'c4-system' })
  expect(byValue(API).style).toMatchObject({ codrawShape: 'c4-container', codrawTechnology: 'Spring Boot', codrawSource: 'architecture:node:shop.api' })
  expect(byValue(CUSTOMER).style.codrawShape).toBe('c4-person')
  expect(byValue(PAYMENTS).style.codrawShape).toBe('c4-external-system')
  for (const value of [WEB, API]) expect(inside(byValue(SHOP), byValue(value))).toBe(true)
  for (const value of [CUSTOMER, PAYMENTS]) expect(inside(byValue(SHOP), byValue(value))).toBe(false)
  const name = (id: string | null) => shapes.find((cell) => cell.id === id)!.value.split('\n')[0]
  expect((await edges(bob)).map((edge) => `${name(edge.source)} -> ${name(edge.target)}: ${edge.value.replace('\n', ' ')}`).sort()).toEqual(
    ['Покупатель -> Сайт: Открывает [HTTPS]', 'Сайт -> API: Вызывает [JSON/HTTPS]', 'API -> Платежи: Проводит оплату'].sort(),
  )

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await vertices(bob)).length).toBe(0)

  await close()
})

test('diagrams of C4-PlantUML make one model, and a file with an error of syntax is named and left out', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт архитектуры как кода…' }).click()
  await menu.getByLabel('Файлы архитектуры').setInputFiles([
    {
      name: 'context.puml',
      mimeType: 'text/plain',
      buffer: Buffer.from('@startuml\n!include <C4/C4_Context>\nPerson(customer, "Покупатель")\nSystem(shop, "Магазин")\nRel(customer, shop, "Покупает")\n@enduml\n'),
    },
    {
      name: 'containers.puml',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        '@startuml\n!include <C4/C4_Container>\nPerson(customer, "Покупатель", "Выбирает товары")\nSystem_Boundary(c1, "Магазин") {\n  Container(web, "Сайт", "React")\n}\nRel(customer, web, "Покупает", "HTTPS")\n@enduml\n',
      ),
    },
    { name: 'broken.puml', mimeType: 'text/plain', buffer: Buffer.from('@startuml\nPerson(admin, "Админ"\n@enduml\n') },
  ])
  await expect(menu.getByRole('alert')).toHaveText('broken.puml: строка 2 — не закрыта скобка')
  await expect(menu.getByRole('status')).toHaveText('Элементов: 2, границ: 1, связей: 1')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

  await expect
    .poll(async () => (await vertices(alice)).map((cell) => cell.value).sort())
    .toEqual(['Магазин\n[Software System]', 'Покупатель\n[Person]\nВыбирает товары', 'Сайт\n[Container: React]'].sort())
  await expect.poll(async () => (await edges(alice)).map((edge) => edge.value)).toEqual(['Покупает\n[HTTPS]'])

  await alice.context().close()
})
