import { describe, expect, it } from 'vitest'
import { ArchitectureBuilder, ArchitectureSyntaxError, type ImportedArchitecture, type ImportedNode } from './importModel.ts'
import { architectureModel } from './model.ts'
import { parseStructurizr } from './parseStructurizr.ts'
import { structurizrDsl } from './structurizr.ts'
import { BIG_BANK_DSL } from './testArchitecture.ts'
import { c4Page } from './testPages.ts'

function read(text: string, name = 'workspace.dsl'): ImportedArchitecture {
  const builder = new ArchitectureBuilder()
  parseStructurizr({ name, text }, builder)
  return builder.build()
}

const node = (model: ImportedArchitecture, key: string): ImportedNode => {
  const found = model.nodes.get(key)
  if (!found) throw new Error(`No node ${key} among ${[...model.nodes.keys()].join(', ')}`)
  return found
}

const relations = (model: ImportedArchitecture) =>
  model.relations.map(({ source, target, description, technology }) => [source, target, description, technology].filter(Boolean).join(' '))

/** The line of the text that starts with `start`, from 1. */
const lineOf = (text: string, start: string) => text.split('\n').findIndex((line) => line.trim().startsWith(start)) + 1

describe('parseStructurizr', () => {
  it('reads the workspace that the export writes', () => {
    const model = read(structurizrDsl(architectureModel(c4Page(), 'Магазин')))

    expect(node(model, 'internet_magazin')).toMatchObject({ type: 'element', kind: 'system', name: 'Интернет-магазин', parent: null })
    expect(node(model, 'api')).toMatchObject({
      kind: 'container',
      name: 'API',
      technology: 'Spring Boot',
      description: 'Заказы, оплата и каталог',
      parent: 'internet_magazin',
    })
    expect(node(model, 'baza_dannykh')).toMatchObject({ kind: 'container', variant: 'database', technology: 'PostgreSQL', tags: [] })
    expect(node(model, 'platezhnyy_shlyuz')).toMatchObject({ kind: 'system', external: true, description: 'Принимает оплату картой' })
    expect(node(model, 'pokupatel')).toMatchObject({ kind: 'person', name: 'Покупатель' })
    expect(relations(model)).toEqual([
      'pokupatel veb_prilozhenie Использует HTTPS',
      'veb_prilozhenie api Вызывает JSON/HTTPS',
      'api baza_dannykh Читает и пишет JDBC',
      'api platezhnyy_shlyuz Проводит оплату HTTPS',
    ])
    // Views and styles are left out without a word.
    expect(model.warnings).toEqual([])
  })

  it('reads hierarchical identifiers, enterprises, tags and relations of every level, and warns of what it leaves out', () => {
    const model = read(BIG_BANK_DSL, 'bigbank.dsl')

    expect(node(model, 'group:/big bank plc')).toMatchObject({ type: 'group', name: 'Big Bank plc', parent: null })
    expect(node(model, 'supportstaff')).toMatchObject({ kind: 'person', parent: 'group:/big bank plc', tags: ['Bank-Staff'] })
    expect(node(model, 'internetbankingsystem.apiapplication')).toMatchObject({ kind: 'container', parent: 'internetbankingsystem' })
    expect(node(model, 'internetbankingsystem.apiapplication.securitycomponent')).toMatchObject({
      kind: 'component',
      technology: 'Spring Bean',
      parent: 'internetbankingsystem.apiapplication',
    })
    expect(node(model, 'internetbankingsystem.database')).toMatchObject({ variant: 'database', tags: [] })
    expect(node(model, 'customer')).toMatchObject({ tags: ['Customer'] })
    expect(model.relations).toHaveLength(10)
    // The relations of the systems that the relations of their containers show.
    expect(model.implied.map(({ source, target }) => `${source} → ${target}`)).toEqual([
      'customer → internetbankingsystem',
      'internetbankingsystem → mainframe',
    ])
    expect(relations(model)).toContain('internetbankingsystem email Sends e-mail using')
    expect(model.warnings).toEqual([
      `bigbank.dsl: строка ${lineOf(BIG_BANK_DSL, '!docs')} — документация и решения (!docs, !adrs) не переносятся`,
      `bigbank.dsl: строка ${lineOf(BIG_BANK_DSL, 'live = deploymentEnvironment')} — развёртывание «Live» не переносится`,
    ])
  })

  it('reads elements without identifiers, this, relations in blocks, blocks of properties, constants and extensions', () => {
    const model = read(`workspace {
      !const ORG "Acme"
      model {
        person "Покупатель"
        shop = softwareSystem "\${ORG} Shop" {
          db = container "Заказы" {
            technology "PostgreSQL"
            description "Заказы и оплаты"
            tags "Database" "pii"
            url https://wiki.example.com/db
            properties {
              "owner" "Команда заказов"
            }
          }
          api = container "API" {
            -> db "Читает и пишет" {
              technology "JDBC"
            }
            this -> payments "Платит"
          }
          group "Внутреннее" {
            worker = container "Worker"
          }
          group "Внутреннее" {
            cron = container "Cron"
          }
        }
        payments = softwareSystem "Payments" "Платежи" "External,Финансы"
        !extend api {
          technology "Kotlin"
        }
        api -/> worker "Будит"
      }
    }`)

    expect(node(model, 'покупатель')).toMatchObject({ kind: 'person', name: 'Покупатель' })
    expect(node(model, 'shop')).toMatchObject({ name: 'Acme Shop' })
    expect(node(model, 'db')).toMatchObject({
      variant: 'database',
      technology: 'PostgreSQL',
      description: 'Заказы и оплаты',
      tags: ['pii'],
      link: 'https://wiki.example.com/db',
    })
    expect(node(model, 'api')).toMatchObject({ technology: 'Kotlin' })
    expect(node(model, 'payments')).toMatchObject({ external: true, tags: ['Финансы'] })
    // Two blocks of one group in one area are one group.
    expect(node(model, 'worker').parent).toBe('group:shop/внутреннее')
    expect(node(model, 'cron').parent).toBe('group:shop/внутреннее')
    expect(relations(model)).toEqual(['api db Читает и пишет JDBC', 'api payments Платит', 'api worker Будит'])
    expect(model.warnings).toEqual([])
  })

  it('reads a fragment of a model without a workspace, as a workspace includes one', () => {
    const model = read('a = person "A"\nb = softwareSystem "B"\na -> b "Uses"\n', 'people.dsl')

    expect([...model.nodes.keys()]).toEqual(['a', 'b'])
    expect(relations(model)).toEqual(['a b Uses'])
  })

  it('runs and loads nothing, and leaves out what it does not support with its block', () => {
    const text = `workspace extends https://example.com/base.dsl {
      model {
        !include people.dsl
        !script groovy {
          workspace.model.addPerson("Hacker")
        }
        x = element "Шина" "ESB"
        archetypes {
          app = container
        }
        a = person "A"
        a -> x "Шлёт"
        a -> nobody "Звонит"
        -> a "Сам"
        model2 {
          b = person "B"
        }
      }
    }`
    const model = read(text)

    expect([...model.nodes.keys()]).toEqual(['a'])
    expect(model.relations).toEqual([])
    expect(model.warnings).toEqual([
      'workspace.dsl: строка 1 — базовое пространство https://example.com/base.dsl не загружается: откройте его вместе с этим файлом',
      'workspace.dsl: строка 3 — !include people.dsl не выполняется: откройте этот файл вместе с остальными',
      'workspace.dsl: строка 4 — !script не выполняется',
      'workspace.dsl: строка 7 — элементы произвольного вида (element) не переносятся',
      'workspace.dsl: строка 8 — не поддерживается: archetypes',
      'workspace.dsl: строка 14 — this вне элемента: отношение пропущено',
      'workspace.dsl: строка 15 — не поддерживается: model2',
      // Relations are resolved once every file is read; one with an element left out needs no warning.
      'workspace.dsl: строка 13 — связь пропущена: нет элемента nobody',
    ])
  })

  it.each([
    ['workspace {\n  model {\n    a = person "A\n  }\n}', 'строка 3 — не закрыта кавычка'],
    ['workspace {\n/* a comment\n', 'строка 2 — не закрыт комментарий'],
    ['workspace {\n}\n}', 'строка 3 — лишняя }'],
    ['workspace { model\n}', 'строка 1 — { должна быть последней на строке'],
    ['workspace {\n  model {\n  } }\n}', 'строка 3 — } должна быть одна на строке'],
    ['workspace {\n  model {\n    a = person "A"\n  }\n', 'не закрыт блок, открытый в строке 1'],
  ])('refuses the whole file for an error of syntax: %j', (text, message) => {
    const builder = new ArchitectureBuilder()

    expect(() => parseStructurizr({ name: 'workspace.dsl', text }, builder)).toThrow(new ArchitectureSyntaxError(message))
    expect(builder.declarations('workspace.dsl')).toBe(0)
  })

  it('reads escaped quotes, text blocks, continued lines, braces inside words and arrows without spaces', () => {
    const model = read(
      [
        'workspace {',
        '  model {',
        '    a = softwareSystem "C:\\\\app \\"main\\"" \\',
        '      "Описание"',
        '    b = container "B" """',
        '      Первая строка',
        '      Вторая строка',
        '    """ "Go" {',
        '      url https://api.example.com/{id}',
        '    }',
        '    a->b "Читает"',
        '  }',
        '}',
      ].join('\n'),
    )

    expect(node(model, 'a')).toMatchObject({ name: 'C:\\app "main"', description: 'Описание' })
    expect(node(model, 'b')).toMatchObject({ description: 'Первая строка\nВторая строка', technology: 'Go', link: 'https://api.example.com/%7Bid%7D' })
    expect(relations(model)).toEqual(['a b Читает'])
  })
})
