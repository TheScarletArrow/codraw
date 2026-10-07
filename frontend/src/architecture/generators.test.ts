import { describe, expect, it } from 'vitest'
import { DiagramBuilder } from '../templates/builder.ts'
import { mermaidC4 } from './mermaid.ts'
import { architectureModel } from './model.ts'
import { plantUml } from './plantuml.ts'
import { structurizrDsl } from './structurizr.ts'
import { c4Page, composePage } from './testPages.ts'

/** The lines of a text without their indents. */
const lines = (text: string) => text.split('\n').map((line) => line.trim())

describe('structurizrDsl', () => {
  it('writes the template «C4: контейнеры» as a workspace with the system, its containers, people and relations', () => {
    const text = structurizrDsl(architectureModel(c4Page(), 'Магазин'))

    expect(lines(text)).toEqual(
      expect.arrayContaining([
        'workspace "Магазин" {',
        'internet_magazin = softwareSystem "Интернет-магазин" {',
        'api = container "API" "Заказы, оплата и каталог" "Spring Boot"',
        'baza_dannykh = container "База данных" "Товары, заказы и покупатели" "PostgreSQL" "Database"',
        'pokupatel = person "Покупатель" "Выбирает и оплачивает товары"',
        'platezhnyy_shlyuz = softwareSystem "Платёжный шлюз" "Принимает оплату картой" "External"',
        'veb_prilozhenie -> api "Вызывает" "JSON/HTTPS"',
        'systemLandscape "landscape" {',
        'container internet_magazin "containers_internet_magazin" {',
        'autolayout lr',
        'element "Database" {',
        'shape Cylinder',
      ]),
    )
    // People and systems are declared in the model, not in the system.
    expect(text.indexOf('pokupatel = person')).toBeGreaterThan(text.indexOf('baza_dannykh = container'))
  })

  it('puts containers outside a system into a system named after the board, with the groups of their frames', () => {
    const builder = new DiagramBuilder()
    const orders = builder.shape('service', 0, 0, { value: 'orders' })
    const database = builder.shape('database', 200, 0, { value: 'orders-db' })
    builder.edge(orders, database, { value: 'Читает и пишет\n[JDBC]' })
    const text = structurizrDsl(architectureModel([...builder.build(), ...composePage()], 'Магазин'))

    expect(lines(text)).toEqual(
      expect.arrayContaining([
        'magazin = softwareSystem "Магазин" {',
        'orders = container "orders"',
        'orders_db = container "orders-db" "" "" "Database"',
        'group "data" {',
        'postgres = container "postgres" "postgres:18-alpine; :5432" "" "Database"',
        'orders -> orders_db "Читает и пишет" "JDBC"',
        'backend -> postgres "JDBC"',
        'container magazin "containers_magazin" {',
      ]),
    )
  })

  it('puts components outside a container into a container named after the board', () => {
    const builder = new DiagramBuilder()
    builder.shape('uml-component', 0, 0, { value: ':app\nKotlin' })
    builder.shape('c4-boundary', 300, 0, { value: 'Ядро\n[Container]', width: 400, height: 200 })
    builder.shape('c4-component', 320, 40, { value: 'Заказы\n[Component: Kotlin]' })

    const text = structurizrDsl(architectureModel(builder.build(), 'Магазин'))

    expect(lines(text)).toEqual(
      expect.arrayContaining([
        'magazin = softwareSystem "Магазин" {',
        'yadro = container "Ядро" {',
        'zakazy = component "Заказы" "" "Kotlin"',
        'magazin_2 = container "Магазин" {',
        'app = component ":app" "Kotlin"',
        'component yadro "components_yadro" {',
        'component magazin_2 "components_magazin_2" {',
      ]),
    )
  })

  it('escapes quotes and backslashes and keeps the blocks of an empty page', () => {
    const builder = new DiagramBuilder()
    builder.shape('service', 0, 0, { value: 'C:\\app "main"' })

    expect(structurizrDsl(architectureModel(builder.build(), 'Доска "Лето"'))).toContain('c_app_main = container "C:\\\\app \\"main\\""')
    expect(lines(structurizrDsl(architectureModel([], 'Пусто')))).toEqual(expect.arrayContaining(['model {', '}']))
  })
})

describe('plantUml', () => {
  it('writes the template with the macros of the standard library and a legend', () => {
    const text = plantUml(architectureModel(c4Page(), 'Магазин'))

    expect(lines(text)).toEqual(
      expect.arrayContaining([
        '@startuml',
        '!include <C4/C4_Component>',
        'title Магазин',
        'System_Boundary(internet_magazin, "Интернет-магазин") {',
        'Container(api, "API", "Spring Boot", "Заказы, оплата и каталог")',
        'ContainerDb(baza_dannykh, "База данных", "PostgreSQL", "Товары, заказы и покупатели")',
        'Person(pokupatel, "Покупатель", "Выбирает и оплачивает товары")',
        'System_Ext(platezhnyy_shlyuz, "Платёжный шлюз", "Принимает оплату картой")',
        'Rel(veb_prilozhenie, api, "Вызывает", "JSON/HTTPS")',
        'SHOW_LEGEND()',
        '@enduml',
      ]),
    )
  })

  it('writes groups as boundaries and quotes as single ones', () => {
    const text = plantUml(architectureModel(composePage(), 'Доска "Лето"'))

    expect(lines(text)).toEqual(
      expect.arrayContaining([
        "title Доска 'Лето'",
        'Boundary(data, "data") {',
        'ContainerDb(postgres, "postgres", "", "postgres:18-alpine; :5432")',
        'Rel(backend, postgres, "JDBC")',
      ]),
    )
  })
})

describe('mermaidC4', () => {
  it('names the diagram by the most detailed level of its elements', () => {
    expect(mermaidC4(architectureModel(c4Page(), 'Магазин')).split('\n')[0]).toBe('C4Container')
    const people = new DiagramBuilder()
    people.shape('c4-person', 0, 0, { value: 'Покупатель\n[Person]' })
    expect(mermaidC4(architectureModel(people.build(), 'Магазин')).split('\n')[0]).toBe('C4Context')
    const components = new DiagramBuilder()
    components.shape('uml-component', 0, 0, { value: ':core' })
    expect(mermaidC4(architectureModel(components.build(), 'Магазин')).split('\n')[0]).toBe('C4Component')
  })

  it('writes the elements in their boundaries and the relations', () => {
    const text = mermaidC4(architectureModel(composePage(), 'Магазин'))

    expect(lines(text)).toEqual(
      expect.arrayContaining([
        'title Магазин',
        'Boundary(data, "data") {',
        'ContainerDb(postgres, "postgres", "", "postgres:18-alpine; :5432")',
        'Container(backend, "backend", "", "./backend")',
        'Rel(backend, postgres, "JDBC")',
      ]),
    )
  })
})
