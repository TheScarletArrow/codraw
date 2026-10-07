import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  edgeProperties,
  kindOfC4Type,
  normalizeProperties,
  parseTags,
  propertiesStyle,
  type ElementProperties,
} from './elementKinds.ts'
import {
  canBeElement,
  composeLabel,
  defaultKind,
  elementProperties,
  KIND_SECTIONS,
  labelFormat,
  parseLabel,
  propertiesOfLabel,
  relabel,
  showsTechnology,
  technologySuggestions,
  TECHNOLOGIES,
  usedProperties,
} from './elementProps.ts'
import { ELEMENT_KEY, getCells, initializeDocument, writeCell } from './model.ts'
import { findShape, markedStyle, type ShapeId } from './shapes.ts'
import { searchShapes } from './shapeSearch.ts'
import { edgeData, shapeData } from './testing.ts'

/** The style of a new shape of the palette. */
const styleOf = (shape: ShapeId) => markedStyle(findShape(shape)!) as Record<string, unknown>

const properties = (changes: Partial<ElementProperties> = {}): ElementProperties => ({
  name: '',
  kind: null,
  technology: '',
  description: '',
  owner: '',
  tags: [],
  ...changes,
})

describe('properties of a shape without an element', () => {
  it('reads a label of C4: the name, the type and the technology, the description', () => {
    expect(elementProperties(styleOf('c4-container'), 'Payments\n[Container: Kotlin, Spring Boot]\nПлатежи\nи возвраты')).toEqual(
      properties({ name: 'Payments', kind: 'c4-container', technology: 'Kotlin, Spring Boot', description: 'Платежи\nи возвраты' }),
    )
  })

  it('takes the words of the palette for no technology and no description', () => {
    const shape = findShape('c4-container')!

    expect(elementProperties(styleOf('c4-container'), shape.value)).toEqual(properties({ name: 'Контейнер', kind: 'c4-container' }))
  })

  it('finds the kind of C4 that the second line names', () => {
    expect(elementProperties(styleOf('c4-container'), 'Lib\n[Component: Kotlin]').kind).toBe('c4-component')
    expect(elementProperties(styleOf('c4-database'), 'DB\n[Container: PostgreSQL]').kind).toBe('c4-database')
    expect(elementProperties(styleOf('c4-boundary'), 'API\n[Container]').kind).toBe('c4-container')
    expect(elementProperties(styleOf('c4-boundary'), 'Магазин\n[Software System]').kind).toBe('c4-system')
  })

  it('reads a plain label: the name on the first line, the technology in brackets on the second', () => {
    expect(elementProperties(styleOf('cache'), 'Кэш\n[Redis]\n:6379')).toEqual(properties({ name: 'Кэш', kind: 'cache', technology: 'Redis' }))
    expect(showsTechnology(styleOf('cache'), 'Кэш\n[Redis]')).toBe(true)
    expect(elementProperties(styleOf('service'), 'Petstore\nGET /pets')).toEqual(properties({ name: 'Petstore', kind: 'service' }))
    expect(showsTechnology(styleOf('service'), 'Petstore\nGET /pets')).toBe(false)
  })

  it('reads a label of HTML from draw.io as its lines', () => {
    expect(elementProperties(styleOf('c4-container'), '<b>Billing</b><div>[Container: Go]</div>')).toMatchObject({
      name: 'Billing',
      technology: 'Go',
    })
  })

  it('gives shapes of no kind of element none', () => {
    expect(defaultKind(styleOf('rectangle'))).toBeNull()
    expect(elementProperties(styleOf('rectangle'), 'Блок').kind).toBeNull()
  })
})

describe('properties of an element', () => {
  it('are those of the style keys, cut and cleaned', () => {
    const style = {
      ...styleOf('service'),
      [ELEMENT_KEY]: 'e1',
      ...propertiesStyle(properties({ name: 'Payments', kind: 'service', technology: 'Kotlin', owner: 'Платежи', tags: ['pci'] })),
    }

    expect(elementProperties(style, 'Payments')).toEqual(
      properties({ name: 'Payments', kind: 'service', technology: 'Kotlin', owner: 'Платежи', tags: ['pci'] }),
    )
  })

  it('keep no kind once it was taken away, whatever the shape', () => {
    expect(elementProperties({ ...styleOf('service'), [ELEMENT_KEY]: 'e1', codrawName: 'API' }, 'API').kind).toBeNull()
  })

  it('read values that came from anywhere as CoDraw keeps them', () => {
    expect(
      normalizeProperties({
        name: '  Pay\nments  ',
        kind: 'rectangle',
        technology: 42,
        description: 'x'.repeat(3000),
        tags: ['a b', 'a', 7, ''],
      }),
    ).toEqual(properties({ name: 'Pay ments', description: 'x'.repeat(2000), tags: ['a', 'b'] }))
    expect(parseTags('pci, core  core,,')).toEqual(['pci', 'core'])
    expect(parseTags(Array.from({ length: 30 }, (_, index) => `t${index}`))).toHaveLength(20)
  })
})

describe('labels', () => {
  it('of C4 are made of the name, the type and technology, and the description', () => {
    const style = styleOf('c4-container')

    expect(composeLabel(properties({ name: 'API', kind: 'c4-container', technology: 'Spring Boot', description: 'Заказы' }), style)).toBe(
      'API\n[Container: Spring Boot]\nЗаказы',
    )
    expect(composeLabel(properties({ name: 'API', kind: 'c4-container' }), style)).toBe('API\n[Container]')
    expect(composeLabel(properties({ name: 'DB', kind: 'c4-database', technology: 'PostgreSQL' }), styleOf('c4-database'))).toBe(
      'DB\n[Container: PostgreSQL]',
    )
    expect(composeLabel(properties({ name: 'Bank', kind: 'c4-external-system' }), styleOf('c4-external-system'))).toBe(
      'Bank\n[Software System]',
    )
  })

  it('of C4 name the type of C4 of a kind of another notation, and a boundary shows no description', () => {
    expect(composeLabel(properties({ name: 'API', kind: 'service', technology: 'Go' }), styleOf('c4-container'))).toBe(
      'API\n[Container: Go]',
    )
    expect(composeLabel(properties({ name: 'Shop', kind: 'c4-system', description: 'Магазин' }), styleOf('c4-boundary'))).toBe(
      'Shop\n[Software System]',
    )
  })

  it('are of C4 for a shape of C4 or for an element of a kind of C4', () => {
    expect(labelFormat(styleOf('c4-person'), null)).toBe('c4')
    expect(labelFormat(styleOf('service'), 'c4-container')).toBe('c4')
    expect(labelFormat(styleOf('service'), 'service')).toBe('plain')
  })

  it('plain ones keep their own lines and show the technology when asked', () => {
    const style = styleOf('service')

    expect(relabel(properties({ name: 'Pets', kind: 'service' }), style, 'Petstore\nGET /pets\nPOST /pets', false)).toBe(
      'Pets\nGET /pets\nPOST /pets',
    )
    expect(relabel(properties({ name: 'Кэш', technology: 'Redis' }), styleOf('cache'), 'Кэш\n:6379', true)).toBe('Кэш\n[Redis]\n:6379')
    expect(relabel(properties({ name: 'Кэш', technology: 'Redis' }), styleOf('cache'), 'Кэш\n[Valkey]\n:6379', false)).toBe('Кэш\n:6379')
  })

  it('of C4 have no lines of their own when the element becomes of a kind of C4', () => {
    expect(relabel(properties({ name: 'API', kind: 'c4-container', technology: 'Go' }), styleOf('service'), 'API\nGET /a', false)).toBe(
      'API\n[Container: Go]',
    )
  })

  it('written on the canvas give the properties back', () => {
    const current = properties({ name: 'API', kind: 'c4-container', technology: 'Java', owner: 'Заказы' })

    expect(propertiesOfLabel('Orders\n[Container:Kotlin]\nЗаказы', current, styleOf('c4-container'))).toEqual({
      properties: { ...current, name: 'Orders', technology: 'Kotlin', description: 'Заказы' },
      showTechnology: false,
    })
    expect(propertiesOfLabel('Orders\n[Component: Kotlin]', current, styleOf('c4-container')).properties.kind).toBe('c4-component')
    expect(propertiesOfLabel('Orders', current, styleOf('c4-container')).properties).toEqual({ ...current, name: 'Orders', technology: '' })
  })

  it('written on the canvas keep the description of a boundary and the technology of a plain shape', () => {
    const boundary = properties({ name: 'Shop', kind: 'c4-system', description: 'Магазин' })
    expect(propertiesOfLabel('Store\n[Software System]', boundary, styleOf('c4-boundary')).properties).toEqual({ ...boundary, name: 'Store' })

    const cache = properties({ name: 'Кэш', kind: 'cache', technology: 'Redis' })
    expect(propertiesOfLabel('Cache\n:6379', cache, styleOf('cache'))).toEqual({ properties: { ...cache, name: 'Cache' }, showTechnology: false })
    expect(propertiesOfLabel('Cache\n[Valkey]', cache, styleOf('cache'))).toEqual({
      properties: { ...cache, name: 'Cache', technology: 'Valkey' },
      showTechnology: true,
    })
  })

  it('of C4 read back as they were made', () => {
    const made = properties({ name: 'API', kind: 'c4-container', technology: 'Go', description: 'Заказы\nи оплата' })
    const style = styleOf('c4-container')

    expect(parseLabel(composeLabel(made, style), 'c4')).toMatchObject({ name: 'API', c4Type: 'Container', technology: 'Go', description: 'Заказы\nи оплата' })
  })
})

describe('kinds', () => {
  it('of a type of C4 keep the kind of that kind of C4', () => {
    expect(kindOfC4Type('Container', 'service')).toBe('service')
    expect(kindOfC4Type('Container', 'c4-person')).toBe('c4-container')
    expect(kindOfC4Type('Software System', 'c4-external-system')).toBe('c4-external-system')
    expect(kindOfC4Type('External System', 'c4-system')).toBe('c4-external-system')
    expect(kindOfC4Type('Container Db', null)).toBe('c4-database')
    expect(kindOfC4Type('Что-то', 'service')).toBe('service')
  })

  it('are offered by the sections of the palette, without frames, text and tables', () => {
    const ids = KIND_SECTIONS.flatMap((section) => section.kinds.map((shape) => shape.id))

    expect(KIND_SECTIONS[0]!.title).toBe('Архитектура')
    expect(ids).toContain('c4-container')
    expect(ids).not.toContain('c4-boundary')
    expect(ids).not.toContain('kubernetes-cluster')
    expect(ids).not.toContain('table')
  })

  it('are of shapes that may be elements', () => {
    expect(canBeElement(styleOf('service'))).toBe(true)
    expect(canBeElement(styleOf('c4-boundary'))).toBe(true)
    for (const shape of ['text', 'sticky', 'table', 'list', 'grid-table'] as const) expect(canBeElement(styleOf(shape))).toBe(false)
  })
})

describe('suggestions', () => {
  it('find the shapes of the palette by their technologies', () => {
    for (const [shape, technologies] of Object.entries(TECHNOLOGIES)) {
      for (const technology of technologies!) expect(searchShapes(technology).map((preset) => preset.id)).toContain(shape)
    }
  })

  it('suggest the technologies of the kind, of its nearest shape for C4, then those of the board', () => {
    expect(technologySuggestions('cache', ['Kafka', 'Redis'])).toEqual(['Redis', 'Memcached', 'Valkey', 'Kafka'])
    expect(technologySuggestions('c4-database', [])).toContain('PostgreSQL')
    expect(technologySuggestions(null, ['Go'])).toEqual(['Go'])
  })

  it('collect the technologies and owners of the elements and edges of a board', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    doc.transact(() => {
      writeCell(getCells(doc), shapeData('a', 'a0', { style: { [ELEMENT_KEY]: 'e1', codrawTechnology: 'Kotlin', codrawOwner: 'Платежи' } }))
      writeCell(getCells(doc), shapeData('b', 'a1', { style: { [ELEMENT_KEY]: 'e2', codrawTechnology: 'Go' } }))
      writeCell(getCells(doc), edgeData('e', 'a2', 'a', 'b', { style: { codrawTechnology: 'gRPC' } }))
    })

    expect(usedProperties(doc)).toEqual({ technologies: ['Go', 'gRPC', 'Kotlin'], owners: ['Платежи'] })
  })
})

describe('edges', () => {
  it('have a technology and an interaction', () => {
    expect(edgeProperties({ codrawTechnology: ' Kafka ', codrawInteraction: 'async' })).toEqual({ technology: 'Kafka', interaction: 'async' })
    expect(edgeProperties({ codrawInteraction: 'maybe' })).toEqual({ technology: '', interaction: null })
  })
})
