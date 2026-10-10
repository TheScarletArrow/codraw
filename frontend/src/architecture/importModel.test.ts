import { describe, expect, it } from 'vitest'
import {
  architectureGraph,
  architectureGraphError,
  architectureImportSummary,
  architectureWarnings,
  ArchitectureBuilder,
  MAX_ARCHITECTURE_NODES,
  readTags,
  webLink,
  type ImportedArchitecture,
} from './importModel.ts'

const at = (line: number) => ({ file: 'shop.dsl', line })

/** The model of a shop: a system with a group and a container of components, a queue, a person and an external system. */
function shop(): ImportedArchitecture {
  const builder = new ArchitectureBuilder()
  const resolve = (reference: string) => (builder.node(reference) ? reference : null)
  builder.element({ key: 'customer', kind: 'person', name: 'Покупатель', link: 'https://example.com/people', parent: null }, at(1))
  builder.element({ key: 'shop', kind: 'system', name: 'Магазин', description: 'Продаёт', tags: ['core'], parent: null }, at(2))
  builder.group({ key: 'group:shop/ядро', kind: 'group', name: 'Ядро', parent: 'shop' }, at(3))
  builder.element({ key: 'api', kind: 'container', name: 'API', technology: 'Kotlin', parent: 'group:shop/ядро' }, at(4))
  builder.element({ key: 'orders', kind: 'component', name: 'Заказы', technology: 'Spring Bean', description: 'Оформляет заказы', parent: 'api' }, at(5))
  builder.element({ key: 'events', kind: 'container', variant: 'queue', name: 'События', technology: 'Kafka', parent: 'shop' }, at(6))
  builder.element({ key: 'db', kind: 'container', variant: 'database', name: 'База', technology: 'PostgreSQL', parent: 'shop' }, at(7))
  builder.element({ key: 'payments', kind: 'system', external: true, name: 'Платежи', parent: null }, at(8))
  builder.group({ key: 'cloud', kind: 'deployment', name: 'Облако', technology: 'Yandex Cloud', parent: null }, at(9))
  builder.relation({ source: 'customer', target: 'shop', description: 'Покупает', resolve, place: at(10) })
  builder.relation({ source: 'customer', target: 'orders', description: 'Оформляет', technology: 'HTTPS', resolve, place: at(11) })
  builder.relation({ source: 'customer', target: 'orders', description: 'Оформляет', technology: 'HTTPS', resolve, place: at(12) })
  builder.relation({ source: 'orders', target: 'db', description: 'Пишет', technology: 'JDBC', resolve, place: at(13) })
  builder.relation({ source: 'shop', target: 'payments', description: 'Платит', resolve, place: at(14) })
  builder.relation({ source: 'api', target: 'shop', description: 'Часть', resolve, place: at(15) })
  builder.relation({ source: 'api', target: 'nobody', resolve, place: at(16) })
  builder.relation({ source: 'api', target: 'api', resolve, place: at(17) })
  return builder.build()
}

describe('ArchitectureBuilder', () => {
  it('draws a relation of an element with parts only when no relation of its parts shows it', () => {
    const model = shop()

    expect(model.relations.map(({ source, target }) => `${source} → ${target}`)).toEqual(['customer → orders', 'orders → db', 'shop → payments'])
    expect(model.implied.map(({ source, target }) => `${source} → ${target}`)).toEqual(['customer → shop'])
    expect(architectureWarnings(model)).toEqual([
      'shop.dsl: строка 15 — связь элемента с его частью не рисуется: api → shop',
      'shop.dsl: строка 16 — связь пропущена: нет элемента nobody',
      'Связей с раскрытыми элементами не нарисовано: 1 — их показывают связи частей: customer → shop',
    ])
  })

  it('fills an element declared again, keeps where it lies and warns of what differs', () => {
    const builder = new ArchitectureBuilder()
    builder.element({ key: 'shop', kind: 'system', name: 'Магазин', parent: null }, at(1))
    builder.group({ key: 'b', kind: 'group', name: 'B', parent: null }, at(2))
    builder.element({ key: 'api', kind: 'container', name: 'API', parent: null }, at(3))
    builder.element({ key: 'api', kind: 'container', technology: 'Go', tags: ['core'], variant: 'database', parent: 'shop' }, at(4))
    builder.element({ key: 'api', kind: 'container', name: 'API', description: 'Заказы', tags: ['core', 'go'], parent: 'b' }, at(5))
    builder.element({ key: 'api', kind: 'component', name: 'API', description: 'Другое', parent: 'shop' }, at(6))
    builder.element({ key: 'b', kind: 'person', name: 'B', parent: null }, at(7))
    builder.group({ key: 'shop', kind: 'group', name: 'Магазин', parent: null }, at(8))
    const model = builder.build()

    expect(model.nodes.get('api')).toMatchObject({
      name: 'API',
      technology: 'Go',
      description: 'Заказы',
      variant: 'database',
      tags: ['core', 'go'],
      parent: 'shop',
    })
    expect(model.warnings).toEqual([
      'shop.dsl: строка 5 — api уже лежит в «Магазин»: оставлен там',
      'shop.dsl: строка 6 — api уже объявлен как Container: оставлен первый',
      'shop.dsl: строка 7 — b уже объявлен как граница: объявление пропущено',
      'shop.dsl: строка 8 — shop уже объявлен как элемент: граница пропущена',
    ])
  })

  it('finds an element of another file by its level, name and node, but not one of the same file', () => {
    const builder = new ArchitectureBuilder()
    builder.element({ key: 'shop', kind: 'system', name: 'Интернет  магазин', parent: null }, { file: 'context.puml', line: 1 })
    const other = builder.element({ key: 'c1', kind: 'system', name: 'интернет магазин', parent: null }, { file: 'containers.puml', line: 1 })
    const again = builder.element({ key: 'c2', kind: 'system', name: 'Интернет магазин', parent: null }, { file: 'context.puml', line: 2 })

    expect([other, again]).toEqual(['shop', 'c2'])
  })

  it('names no element by an empty name and takes the key for a name never given', () => {
    const builder = new ArchitectureBuilder()
    builder.element({ key: 'a', kind: 'person', parent: null }, { file: 'a.puml', line: 1 })
    builder.element({ key: 'b', kind: 'person', parent: null }, { file: 'b.puml', line: 1 })

    expect([...builder.build().nodes.values()].map((node) => node.name)).toEqual(['a', 'b'])
  })
})

describe('architectureGraph', () => {
  it('makes frames of the elements with parts and of groups, and shapes of C4 of the others with their properties', () => {
    const graph = architectureGraph(shop())

    expect(graph.frames).toEqual([
      {
        shape: 'c4-boundary',
        label: 'Магазин\n[Software System]',
        parent: null,
        key: 'shop',
        element: { name: 'Магазин', kind: 'c4-system', technology: '', description: 'Продаёт', owner: '', tags: ['core'] },
      },
      { shape: 'boundary', label: 'Ядро', parent: 0, key: 'group:shop/ядро' },
      {
        shape: 'c4-boundary',
        label: 'API\n[Container: Kotlin]',
        parent: 1,
        key: 'api',
        element: { name: 'API', kind: 'c4-container', technology: 'Kotlin', description: '', owner: '', tags: [] },
      },
      { shape: 'c4-deployment-node', label: 'Облако\n[Yandex Cloud]', parent: null, key: 'cloud' },
    ])
    expect(graph.nodes.map(({ shape, lines, frame, key }) => ({ shape, lines, frame, key }))).toEqual([
      { shape: 'c4-person', lines: ['Покупатель', '[Person]'], frame: null, key: 'customer' },
      { shape: 'c4-component', lines: ['Заказы', '[Component: Spring Bean]', 'Оформляет заказы'], frame: 2, key: 'orders' },
      { shape: 'queue', lines: ['События', '[Kafka]'], frame: 0, key: 'events' },
      { shape: 'c4-database', lines: ['База', '[Container: PostgreSQL]'], frame: 0, key: 'db' },
      { shape: 'c4-external-system', lines: ['Платежи', '[Software System]'], frame: null, key: 'payments' },
    ])
    expect(graph.nodes[0]).toMatchObject({ link: 'https://example.com/people', maxWidth: 320, element: { kind: 'c4-person', name: 'Покупатель' } })
    expect(graph.nodes[2]).toMatchObject({ showTechnology: true, element: { kind: 'queue', technology: 'Kafka' } })
    expect(graph.nodes[2]).not.toHaveProperty('maxWidth')
    expect(graph.edges).toEqual([
      { source: 0, target: 1, label: 'Оформляет\n[HTTPS]', technology: 'HTTPS' },
      { source: 1, target: 3, label: 'Пишет\n[JDBC]', technology: 'JDBC' },
      { source: 0, sourceFrame: true, target: 4, label: 'Платит' },
    ])
    expect(architectureImportSummary(graph)).toBe('Элементов: 5, границ: 4, связей: 3')
    expect(architectureGraphError(graph)).toBeNull()
  })

  it('refuses more elements and frames than an import adds at once, and lists at most 30 warnings', () => {
    const builder = new ArchitectureBuilder()
    for (let index = 0; index <= MAX_ARCHITECTURE_NODES; index++) builder.element({ key: `e${index}`, kind: 'container', parent: null }, at(index + 1))
    for (let index = 0; index < 32; index++) builder.warn(at(index + 1), 'не поддерживается: x')
    const model = builder.build()

    expect(architectureGraphError(architectureGraph(model))).toBe('Слишком много элементов и границ: 301, за раз можно добавить не больше 300')
    expect(architectureWarnings(model)).toHaveLength(31)
    expect(architectureWarnings(model).at(-1)).toBe('…и ещё 2')
  })
})

describe('readTags and webLink', () => {
  it('reads the variant and the tags of a participant, without those Structurizr gives every element', () => {
    expect(readTags(['Element', 'Container', 'Database', 'Mobile App', 'pii', ''])).toEqual({ variant: 'database', tags: ['Mobile-App', 'pii'] })
    expect(readTags(['External', 'queue'])).toEqual({ variant: 'queue', external: true, tags: [] })
  })

  it('keeps addresses of the web only', () => {
    expect(webLink('https://wiki.example.com/a b')).toBe('https://wiki.example.com/a%20b')
    expect(webLink('javascript:alert(1)')).toBe('')
    expect(webLink('docs/api.md')).toBe('')
    expect(webLink(undefined)).toBe('')
  })
})
