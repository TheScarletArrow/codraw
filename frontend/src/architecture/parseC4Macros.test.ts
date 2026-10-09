import { describe, expect, it } from 'vitest'
import { ArchitectureBuilder, ArchitectureSyntaxError, type ImportedArchitecture, type ImportedNode } from './importModel.ts'
import { mermaidC4 } from './mermaid.ts'
import { architectureModel } from './model.ts'
import { parseC4Macros } from './parseC4Macros.ts'
import { plantUml } from './plantuml.ts'
import { MERMAID_C4 } from './testArchitecture.ts'
import { c4Page, composePage } from './testPages.ts'

function read(text: string, name = 'diagram.puml'): ImportedArchitecture {
  const builder = new ArchitectureBuilder()
  parseC4Macros({ name, text }, builder)
  return builder.build()
}

const node = (model: ImportedArchitecture, key: string): ImportedNode => {
  const found = model.nodes.get(key)
  if (!found) throw new Error(`No node ${key} among ${[...model.nodes.keys()].join(', ')}`)
  return found
}

const relations = (model: ImportedArchitecture) =>
  model.relations.map(({ source, target, description, technology }) => [source, target, description, technology].filter(Boolean).join(' '))

describe('parseC4Macros', () => {
  it('reads the diagram of C4-PlantUML that the export writes', () => {
    const model = read(plantUml(architectureModel(c4Page(), 'Магазин')))

    expect(node(model, 'internet_magazin')).toMatchObject({ type: 'element', kind: 'system', name: 'Интернет-магазин', parent: null })
    expect(node(model, 'api')).toMatchObject({ kind: 'container', technology: 'Spring Boot', description: 'Заказы, оплата и каталог', parent: 'internet_magazin' })
    expect(node(model, 'baza_dannykh')).toMatchObject({ variant: 'database', technology: 'PostgreSQL' })
    expect(node(model, 'platezhnyy_shlyuz')).toMatchObject({ kind: 'system', external: true })
    expect(relations(model)).toEqual([
      'pokupatel veb_prilozhenie Использует HTTPS',
      'veb_prilozhenie api Вызывает JSON/HTTPS',
      'api baza_dannykh Читает и пишет JDBC',
      'api platezhnyy_shlyuz Проводит оплату HTTPS',
    ])
    expect(model.warnings).toEqual([])
  })

  it('reads the groups of a page as boundaries', () => {
    const model = read(plantUml(architectureModel(composePage(), 'Магазин')))

    expect(node(model, 'data')).toMatchObject({ type: 'group', kind: 'group', name: 'data' })
    expect(node(model, 'postgres')).toMatchObject({ variant: 'database', description: 'postgres:18-alpine; :5432', parent: 'data' })
    expect(model.warnings).toEqual([])
  })

  it('reads arguments by place and by name, tags, links and new lines', () => {
    const model = read(`Container(api, "API", "Spring Boot", "Заказы, оплата и каталог", $tags="backend+core", $link="https://wiki.example.com/api")
Component(a, "A\\nB", $descr="Первая\\nВторая", $techn="Kotlin\\nJVM", $tags="Database")
System(ftp, "FTP", $link="ftp://example.com")`)

    expect(node(model, 'api')).toMatchObject({
      name: 'API',
      technology: 'Spring Boot',
      description: 'Заказы, оплата и каталог',
      tags: ['backend', 'core'],
      link: 'https://wiki.example.com/api',
    })
    expect(node(model, 'a')).toMatchObject({ name: 'A B', technology: 'Kotlin JVM', description: 'Первая\nВторая', variant: 'database', tags: [] })
    expect(node(model, 'ftp')).toMatchObject({ link: '' })
  })

  it('reads relations of every direction, back, both ways and with an index', () => {
    const model = read(`Container(api, "API")
Container(db, "db")
Container(cache, "cache")
Rel_Back(db, api, "Читает")
BiRel(api, cache, "Синхронизирует")
RelIndex(1, api, db, "Пишет", "JDBC")
Rel_U(cache, db, "Греет")
Rel_Back_Neighbor(cache, db, "Наполняет")`)

    expect(relations(model)).toEqual([
      'api db Читает',
      'api cache Синхронизирует',
      'cache api Синхронизирует',
      'api db Пишет JDBC',
      'cache db Греет',
      'db cache Наполняет',
    ])
  })

  it('reads a diagram of Mermaid C4 with enterprises, nested boundaries, queues and nodes of deployment', () => {
    const model = read(MERMAID_C4, 'shop.mmd')

    expect(node(model, 'company')).toMatchObject({ type: 'group', name: 'Компания', parent: null })
    expect(node(model, 'shop')).toMatchObject({ type: 'element', kind: 'system', parent: 'company' })
    expect(node(model, 'events')).toMatchObject({ kind: 'container', variant: 'queue', technology: 'Kafka', parent: 'shop' })
    expect(node(model, 'cloud')).toMatchObject({ type: 'group', kind: 'deployment', name: 'Облако', technology: 'Yandex Cloud' })
    expect(node(model, 'worker')).toMatchObject({ parent: 'cloud' })
    expect(relations(model)).toEqual(['customer web Покупает HTTPS', 'web events Публикует', 'worker events Читает', 'events worker Читает'])
    expect(model.warnings).toEqual([])
  })

  it('reads the diagram that the export to Mermaid C4 writes', () => {
    const model = read(mermaidC4(architectureModel(c4Page(), 'Магазин')), 'page.mmd')

    expect(model.nodes.size).toBe(6)
    expect(model.relations).toHaveLength(4)
    expect(model.warnings).toEqual([])
  })

  it('knows the library of C4 and runs, includes and loads nothing else', () => {
    const model = read(`@startuml
!include <C4/C4_Context>
!include common.puml
!includeurl https://example.com/c4.puml
!theme plain
!define TEAM "Платежи"
!procedure $service($alias)
  Container($alias, "Сервис")
!endprocedure
!$color = "red"
/' a comment
   on two lines '/
skinparam rectangle {
  BackgroundColor white
}
legend
  Легенда
endlegend
Person(user, "Пользователь") /' an inline comment '/
System_Boundary(shop, "Магазин")
{
  Container(api, "API",
    "Kotlin")
}
note right of user
  Заметка
end note
Sprite(user)
user --> api : вызывает
Lay_R(user, shop)
package "Внешнее" {
  System_Ext(bank, "Банк")
}
title Магазин {черновик}
SHOW_LEGEND()
@enduml`)

    expect([...model.nodes.keys()]).toEqual(['user', 'shop', 'api', 'bank'])
    expect(node(model, 'api')).toMatchObject({ technology: 'Kotlin', parent: 'shop' })
    expect(model.warnings).toEqual([
      'diagram.puml: строка 3 — !include common.puml не выполняется: откройте этот файл вместе с остальными',
      'diagram.puml: строка 4 — !includeurl https://example.com/c4.puml не выполняется: откройте этот файл вместе с остальными',
      'diagram.puml: строка 6 — препроцессор PlantUML не выполняется: !define',
      'diagram.puml: строка 7 — препроцессор PlantUML не выполняется: !procedure',
      'diagram.puml: строка 10 — препроцессор PlantUML не выполняется: !$color',
      'diagram.puml: строка 25 — заметки не переносятся',
      'diagram.puml: строка 28 — не поддерживается: Sprite(…)',
      'diagram.puml: строка 29 — строка не разобрана: user --> api : вызывает',
      'diagram.puml: строка 31 — строка не разобрана: package "Внешнее"',
    ])
  })

  it.each([
    ['Person(user, "Пользователь"', 'строка 1 — не закрыта скобка'],
    ['Person(user, "Пользователь)', 'строка 1 — не закрыта кавычка'],
    ["/' a comment\nPerson(user)", 'строка 1 — не закрыт комментарий'],
    ['Person(user)\n}', 'строка 2 — лишняя }'],
    ['System_Boundary(shop, "Магазин") {\nPerson(user)', 'не закрыт блок, открытый в строке 1'],
    ['!include <C4/C4_Context>\n{', 'строка 2 — { должна быть последней на строке'],
    ['System_Boundary(shop, "Магазин") {\n} Person(user)', 'строка 2 — } должна быть одна на строке'],
  ])('refuses the whole file for an error of syntax: %j', (text, message) => {
    const builder = new ArchitectureBuilder()

    expect(() => parseC4Macros({ name: 'diagram.puml', text }, builder)).toThrow(new ArchitectureSyntaxError(message))
    expect(builder.declarations('diagram.puml')).toBe(0)
  })
})
