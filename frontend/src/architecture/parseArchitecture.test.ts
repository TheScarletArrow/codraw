import { describe, expect, it } from 'vitest'
import { architectureGraph, architectureImportSummary, architectureWarnings } from './importModel.ts'
import { ArchitectureFormatError, detectFormat, MAX_ARCHITECTURE_SIZE, parseArchitectureFiles } from './parseArchitecture.ts'
import { BIG_BANK_CONTAINERS, BIG_BANK_CONTEXT, BIG_BANK_DSL, MERMAID_C4 } from './testArchitecture.ts'

const summaryOf = (sources: { name: string; text: string; size?: number }[]) => {
  const { model, errors } = parseArchitectureFiles(sources)
  return { model, errors, summary: architectureImportSummary(architectureGraph(model)), warnings: architectureWarnings(model) }
}

describe('detectFormat', () => {
  it.each([
    ['workspace.dsl', BIG_BANK_DSL, 'structurizr'],
    ['Текст', '// a comment\nworkspace "Shop" {\n}', 'structurizr'],
    ['context.puml', BIG_BANK_CONTEXT, 'plantuml'],
    ['Текст', "' a comment\n@startuml\n@enduml", 'plantuml'],
    ['shop.mmd', MERMAID_C4, 'mermaid'],
    ['Текст', '%% C4\nC4Context\nPerson(a, "A")', 'mermaid'],
    ['people.dsl', 'a = person "A"', 'structurizr'],
    ['diagram.iuml', 'Person(a, "A")', 'plantuml'],
    ['Текст', 'Person(a, "A")\nSystem(b, "B")', 'plantuml'],
    ['Текст', 'model {\n  a = person "A"\n}', 'structurizr'],
    ['Текст', 'shop = softwareSystem "Магазин"', 'structurizr'],
  ])('knows %s by its text or its extension', (name, text, format) => {
    expect(detectFormat({ name, text })).toBe(format)
  })

  it('names the import of other diagrams of Mermaid and says what it expects of a text of no format', () => {
    expect(() => detectFormat({ name: 'flow.mmd', text: 'flowchart LR\n  a --> b' })).toThrow(
      new ArchitectureFormatError('это Mermaid, но не C4 — блок-схемы, ER-диаграммы и диаграммы последовательности импортирует «Импорт Mermaid…»'),
    )
    expect(() => detectFormat({ name: 'empty.mmd', text: '' })).toThrow(/это Mermaid, но не C4/)
    expect(() => detectFormat({ name: 'notes.txt', text: 'Список сервисов: заказы, оплата' })).toThrow(
      new ArchitectureFormatError(
        'не удалось узнать формат — ожидается workspace Structurizr DSL, @startuml с макросами C4-PlantUML или C4Context Mermaid C4',
      ),
    )
  })
})

describe('parseArchitectureFiles', () => {
  it('makes one model of the context and the containers, with one element for each repeated one', () => {
    const { errors, summary, model, warnings } = summaryOf([
      { name: 'context.puml', text: 'Person(customer, "Покупатель")\nSystem(shop, "Магазин")\nRel(customer, shop, "Покупает")' },
      {
        name: 'containers.puml',
        text: 'Person(customer, "Покупатель", "Выбирает товары")\nSystem_Boundary(c1, "Магазин") {\n  Container(web, "Сайт", "React")\n}\nRel(customer, web, "Покупает", "HTTPS")',
      },
    ])

    expect(errors).toEqual([])
    expect(summary).toBe('Элементов: 2, границ: 1, связей: 1')
    expect(model.nodes.get('customer')).toMatchObject({ description: 'Выбирает товары' })
    expect(model.nodes.get('web')).toMatchObject({ parent: 'shop' })
    expect(model.relations).toEqual([{ source: 'customer', target: 'web', description: 'Покупает', technology: 'HTTPS' }])
    expect(warnings).toEqual(['Связей с раскрытыми элементами не нарисовано: 1 — их показывают связи частей: customer → shop'])
  })

  it('tells the elements of the example of C4-PlantUML apart by their names and their kinds', () => {
    const { errors, summary, model } = summaryOf([
      { name: 'context.puml', text: BIG_BANK_CONTEXT },
      { name: 'container.puml', text: BIG_BANK_CONTAINERS },
    ])

    expect(errors).toEqual([])
    expect(summary).toBe('Элементов: 7, границ: 1, связей: 8')
    // `customer` is named «Customer» in the containers, and `banking_system` is the mainframe there.
    expect(model.nodes.get('customer')).toMatchObject({ name: 'Personal Banking Customer' })
    expect(model.relations).toContainEqual({ source: 'backend_api', target: 'mainframe', description: 'Uses', technology: 'sync/async, XML/HTTPS' })
    expect(model.relations).toContainEqual({ source: 'mail_system', target: 'customer', description: 'Sends e-mails to', technology: '' })
  })

  it('keeps an element of another file under the same alias apart when it is named otherwise', () => {
    const { model, warnings } = summaryOf([
      { name: 'context.puml', text: 'System(banking_system, "Internet Banking System")' },
      { name: 'container.puml', text: BIG_BANK_CONTAINERS.split('\n').slice(0, 16).join('\n') },
    ])

    expect(model.nodes.get('banking_system')).toMatchObject({ name: 'Internet Banking System', external: false })
    expect(model.nodes.get('banking_system_2')).toMatchObject({ name: 'Mainframe Banking System', external: true })
    expect(warnings).toContain('container.puml: строка 16 — banking_system в context.puml — другой элемент: здесь он назван иначе')
  })

  it('keeps the first of two levels of C4 of one element', () => {
    const { model, warnings } = summaryOf([
      { name: 'context.puml', text: 'System(api, "API")' },
      { name: 'containers.puml', text: '@startuml\n!include <C4/C4_Container>\nContainer(api, "API")\n@enduml' },
    ])

    expect([...model.nodes.values()].map((node) => node.type === 'element' && node.kind)).toEqual(['system'])
    expect(warnings).toEqual(['containers.puml: строка 3 — api уже объявлен как Software System: оставлен первый'])
  })

  it('adds the files it can read and names those it cannot', () => {
    const { errors, summary } = summaryOf([
      { name: 'workspace.dsl', text: 'workspace {\n  model {\n    a = person "A"\n  }\n' },
      { name: 'big.puml', text: '', size: MAX_ARCHITECTURE_SIZE + 1 },
      { name: 'notes.txt', text: 'Список сервисов: заказы, оплата' },
      { name: 'empty.puml', text: '@startuml\ntitle Пусто\n@enduml' },
      { name: 'shop.mmd', text: MERMAID_C4 },
    ])

    expect(errors).toEqual([
      'workspace.dsl: не закрыт блок, открытый в строке 1',
      'big.puml: файл больше 1 МБ',
      'notes.txt: не удалось узнать формат — ожидается workspace Structurizr DSL, @startuml с макросами C4-PlantUML или C4Context Mermaid C4',
      'empty.puml: нет элементов C4',
    ])
    expect(summary).toBe('Элементов: 5, границ: 3, связей: 4')
  })

  it('reads files of different formats into one model', () => {
    const { model, errors } = summaryOf([
      { name: 'people.dsl', text: 'customer = person "Покупатель"' },
      { name: 'shop.mmd', text: MERMAID_C4 },
    ])

    expect(errors).toEqual([])
    expect([...model.nodes.keys()].filter((key) => key === 'customer')).toHaveLength(1)
    expect(model.nodes.get('customer')).toMatchObject({ description: 'Выбирает товары' })
  })
})
