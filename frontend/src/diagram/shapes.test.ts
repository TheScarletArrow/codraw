import { describe, expect, it } from 'vitest'
import { fromStyle } from './binding.ts'
import { findShape, isTableStyle, SHAPE_SECTIONS, SHAPES, TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from './shapes.ts'

describe('shape presets', () => {
  it('are grouped into the sections of the palette', () => {
    expect(SHAPE_SECTIONS.map((section) => [section.title, section.shapes.map((shape) => shape.label)])).toEqual([
      ['Основные', ['Прямоугольник', 'Скруглённый прямоугольник', 'Эллипс', 'Ромб', 'Текст']],
      ['База данных', ['Таблица']],
      [
        'Архитектура',
        ['Сервис', 'База данных', 'Очередь', 'Кэш', 'Пользователь', 'Внешняя система', 'Документ', 'Граница'],
      ],
      [
        'C4',
        ['Person', 'Software System', 'Container', 'Component', 'Database', 'External System', 'Граница системы'],
      ],
    ])
    expect(new Set(SHAPES.map((shape) => shape.id)).size).toBe(SHAPES.length)
  })

  it('keep the whole style in the document', () => {
    for (const shape of SHAPES) {
      expect(fromStyle(shape.style as never)).toEqual(shape.style)
      shape.children?.forEach((child) => expect(fromStyle(child.style as never)).toEqual(child.style))
    }
  })

  it('make a table with the field «id uuid PK» under its header', () => {
    const table = findShape('table')!

    expect(isTableStyle(table.style)).toBe(true)
    expect(table.style).toMatchObject({ shape: 'swimlane', startSize: TABLE_HEADER_HEIGHT })
    expect(table.children).toEqual([expect.objectContaining({ value: 'id uuid PK', height: TABLE_FIELD_HEIGHT })])
    expect(table.children![0]!.style).toMatchObject({ portConstraint: 'eastwest', movable: false })
    expect(table.height).toBe(TABLE_HEADER_HEIGHT + TABLE_FIELD_HEIGHT)
  })

  it('caption architecture shapes with their names and use draw.io shapes', () => {
    const architecture = SHAPE_SECTIONS.find((section) => section.title === 'Архитектура')!.shapes

    for (const shape of architecture) expect(shape.value).toBe(shape.label)
    expect(findShape('database')!.style.shape).toBe('cylinder')
    expect(findShape('queue')!.style).toMatchObject({ shape: 'cylinder', direction: 'south' })
    expect(findShape('user')!.style.shape).toBe('actor')
    expect(findShape('external-system')!.style.shape).toBe('cloud')
    expect(findShape('document')!.style.shape).toBe('document')
  })

  it('caption C4 shapes with the name, the type and the description', () => {
    expect(findShape('c4-container')!.value.split('\n')).toEqual(['Контейнер', '[Container: технология]', 'Описание'])
    expect(findShape('c4-container')!.style).toMatchObject({ fillColor: '#438DD5', fontColor: '#ffffff' })
    expect(findShape('c4-person')!.style.shape).toBe('mxgraph.c4.person2')
    expect(findShape('c4-component')!.style.fontColor).toBe('#000000')
  })

  it('let clicks inside a boundary reach the shapes under it', () => {
    for (const id of ['boundary', 'c4-boundary']) {
      expect(findShape(id)!.style).toMatchObject({ fillColor: 'none', dashed: true, pointerEvents: false })
    }
  })
})
