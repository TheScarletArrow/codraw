import { describe, expect, it } from 'vitest'
import { parseStyle } from '../drawio/style.ts'
import { fromStyle } from './binding.ts'
import {
  findShape,
  groupShapes,
  hasTextFit,
  isStickyStyle,
  isTableStyle,
  markedStyle,
  SHAPE_SECTIONS,
  shapeGroup,
  shapeGroupOf,
  shapeOf,
  SHAPES,
  TABLE_FIELD_HEIGHT,
  TABLE_HEADER_HEIGHT,
  UNGROUPED_SHAPES,
  type ShapeStyle,
} from './shapes.ts'

describe('shape presets', () => {
  it('are grouped into the sections of the palette', () => {
    expect(SHAPE_SECTIONS.map((section) => [section.title, section.shapes.map((shape) => shape.label)])).toEqual([
      [
        'Основные',
        [
          'Прямоугольник',
          'Скруглённый прямоугольник',
          'Эллипс',
          'Ромб',
          'Треугольник',
          'Шестиугольник',
          'Пятиугольник',
          'Звезда',
          'Текст',
          'Стикер',
        ],
      ],
      ['База данных', ['Таблица']],
      ['Структуры', ['Сетка таблицы', 'Список']],
      ['Блок-схемы', ['Процесс', 'Терминатор', 'Условие', 'Данные', 'Документ процесса', 'Подпроцесс']],
      ['BPMN', ['Задача', 'Событие', 'Шлюз', 'Объект данных', 'Пул / дорожки']],
      [
        'Архитектура',
        ['Сервис', 'База данных', 'Очередь', 'Кэш', 'Пользователь', 'Внешняя система', 'Документ', 'Граница'],
      ],
      [
        'Инфраструктура',
        ['Балансировщик нагрузки', 'API-шлюз', 'CDN', 'Сервер', 'Контейнер', 'Кластер Kubernetes', 'Брандмауэр', 'DNS'],
      ],
      [
        'Данные и сообщения',
        ['Хранилище объектов', 'Поисковый индекс', 'Хранилище данных', 'Топик событий', 'Планировщик задач', 'Функция'],
      ],
      ['Клиенты', ['Веб-браузер', 'Мобильное приложение', 'Десктоп-приложение', 'IoT-устройство']],
      ['UML', ['Компонент', 'Интерфейс', 'Пакет', 'Заметка']],
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

  it('make a text whose width follows the text, as in draw.io', () => {
    expect(findShape('text')!.style).toMatchObject({ autosize: true })
    expect(findShape('rectangle')!.style.autosize).toBeUndefined()
  })

  it('offer geometry shapes beyond the first four basics', () => {
    expect(findShape('triangle')!.style.shape).toBe('codraw.triangle')
    expect(findShape('hexagon')!.style.shape).toBe('hexagon')
    expect(findShape('pentagon')!.style.shape).toBe('codraw.pentagon')
    expect(findShape('star')!.style.shape).toBe('codraw.star')
  })

  it('offer structured elements for tables with cells and lists', () => {
    expect(findShape('grid-table')).toMatchObject({
      label: 'Сетка таблицы',
      value: 'Таблица',
      style: { shape: 'codraw.gridTable', gridRows: 4, gridColumns: 3 },
    })
    expect(findShape('list')).toMatchObject({
      label: 'Список',
      value: '• Элемент\n• Элемент\n• Элемент',
      style: { align: 'left', verticalAlign: 'top' },
    })
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

  it('caption system design shapes with their names and draw them with registered shapes', () => {
    const sections = ['Инфраструктура', 'Данные и сообщения', 'Клиенты', 'UML']
    const shapes = SHAPE_SECTIONS.filter((section) => sections.includes(section.title)).flatMap((section) => section.shapes)

    for (const shape of shapes) {
      expect(shape.value).toBe(shape.label)
      if (shape.id !== 'kubernetes-cluster') expect(shape.style.shape).toBeDefined()
    }
    expect(findShape('server')!.style).toMatchObject({ shape: 'codraw.server', verticalLabelPosition: 'bottom' })
    expect(findShape('dns')!.style.shape).toBe('card')
    expect(findShape('uml-note')!.style).toMatchObject({ shape: 'note', fillColor: '#fff2cc' })
  })

  it('caption flowchart and BPMN shapes with their names and draw them with diagram shapes', () => {
    expect(findShape('flow-terminator')!.style).toMatchObject({ rounded: true, arcSize: 50 })
    expect(findShape('flow-data')!.style.shape).toBe('parallelogram')
    expect(findShape('flow-predefined-process')!.style.shape).toBe('codraw.predefinedProcess')
    expect(findShape('bpmn-event')!.style).toMatchObject({ shape: 'codraw.bpmnEvent', verticalLabelPosition: 'bottom' })
    expect(findShape('bpmn-gateway')!.style.shape).toBe('codraw.bpmnGateway')
    expect(findShape('bpmn-pool')!.style).toMatchObject({ shape: 'codraw.bpmnPool', lanes: 3, pointerEvents: false })
  })

  it('let clicks inside a boundary reach the shapes under it', () => {
    for (const id of ['boundary', 'c4-boundary', 'kubernetes-cluster']) {
      expect(findShape(id)!.style).toMatchObject({ fillColor: 'none', dashed: true, pointerEvents: false })
    }
    expect(findShape('bpmn-pool')!.style).toMatchObject({ fillColor: 'none', pointerEvents: false })
  })
})

describe('stickies', () => {
  it('are squares of the first color of stickies whose words wrap and whose text fits them, without a line', () => {
    expect(findShape('sticky')).toMatchObject({ label: 'Стикер', width: 160, height: 160, value: '' })
    expect(findShape('sticky')!.style).toEqual({
      fillColor: '#fff2cc',
      strokeColor: 'none',
      shadow: true,
      whiteSpace: 'wrap',
      autosizeText: true,
      fontSize: 20,
      spacingBottom: 14,
    })
    expect(shapeGroupOf(markedStyle(findShape('sticky')!))).toBeNull()
  })

  it('are shapes made as stickies and the notes of draw.io whose text fits them', () => {
    expect(isStickyStyle(markedStyle(findShape('sticky')!))).toBe(true)
    expect(isStickyStyle({ codrawShape: 'sticky', fontSize: 28 })).toBe(true)
    expect(isStickyStyle(parseStyle('shape=note;whiteSpace=wrap;autosizeText=1;fillColor=#FFF9B2;', 'vertex'))).toBe(true)
    expect(isStickyStyle({ autosizeText: '1' })).toBe(true)
    expect(isStickyStyle(markedStyle(findShape('uml-note')!))).toBe(false)
    expect(isStickyStyle({ autosizeText: false })).toBe(false)
    expect(isStickyStyle(null)).toBe(false)
  })

  it('fit their text unless their width follows it', () => {
    expect(hasTextFit({ autosizeText: true })).toBe(true)
    expect(hasTextFit({ autosizeText: 1 })).toBe(true)
    expect(hasTextFit({ autosizeText: true, autosize: true })).toBe(false)
    expect(hasTextFit({ codrawShape: 'sticky' })).toBe(false)
  })
})

describe('shape groups', () => {
  const ids = (shapes: { id: string }[]) => shapes.map((shape) => shape.id)
  const drawio = (style: string) => parseStyle(style, 'vertex') as ShapeStyle

  it('join the sections of the palette into notations', () => {
    expect(SHAPE_SECTIONS.map((section) => section.group)).toEqual([
      'basic',
      'tables',
      'elements',
      'flowchart',
      'bpmn',
      'system',
      'system',
      'system',
      'system',
      'uml',
      'c4',
    ])
  })

  it('hold every shape of the palette but frames, text and stickies, in the group of its section', () => {
    expect([...UNGROUPED_SHAPES]).toEqual(['text', 'sticky', 'boundary', 'bpmn-pool', 'kubernetes-cluster', 'c4-boundary'])
    for (const section of SHAPE_SECTIONS) {
      for (const shape of section.shapes) {
        expect(shapeGroup(shape.id)).toBe(UNGROUPED_SHAPES.has(shape.id) ? null : section.group)
      }
    }
  })

  it('list the shapes of a group in the order of the palette', () => {
    expect(ids(groupShapes('tables'))).toEqual(['table'])
    expect(ids(groupShapes('basic'))).toEqual(['rectangle', 'rounded', 'ellipse', 'rhombus', 'triangle', 'hexagon', 'pentagon', 'star'])
    expect(ids(groupShapes('elements'))).toEqual(['grid-table', 'list'])
    expect(ids(groupShapes('flowchart'))).toEqual([
      'flow-process',
      'flow-terminator',
      'flow-decision',
      'flow-data',
      'flow-document',
      'flow-predefined-process',
    ])
    expect(ids(groupShapes('bpmn'))).toEqual(['bpmn-task', 'bpmn-event', 'bpmn-gateway', 'bpmn-data-object'])
    const system = ids(groupShapes('system'))
    expect(system.slice(0, 3)).toEqual(['service', 'database', 'queue'])
    expect(system).toContain('load-balancer')
    expect(system).toContain('iot-device')
    expect(system).not.toContain('boundary')
    expect(system).not.toContain('kubernetes-cluster')
    expect(ids(groupShapes('c4'))).not.toContain('c4-boundary')
  })

  it('mark a style with the palette shape it comes from', () => {
    expect(markedStyle(findShape('service')!)).toEqual({ rounded: true, codrawShape: 'service' })
    for (const shape of SHAPES) expect(shapeOf(markedStyle(shape))).toBe(shape)
  })

  it('tell apart shapes with the same style by the mark', () => {
    expect(shapeGroupOf(markedStyle(findShape('rounded')!))).toBe('basic')
    expect(shapeGroupOf(markedStyle(findShape('service')!))).toBe('system')
    expect(shapeGroupOf(markedStyle(findShape('c4-database')!))).toBe('c4')
    expect(shapeGroupOf(markedStyle(findShape('boundary')!))).toBeNull()
  })

  it('recognize unmarked shapes by their style', () => {
    expect(shapeOf({})?.id).toBe('rectangle')
    expect(shapeOf({ rounded: true })?.id).toBe('rectangle')
    expect(shapeOf({ shape: 'ellipse' })?.id).toBe('ellipse')
    expect(shapeOf({ shape: 'cylinder' })?.id).toBe('database')
    expect(shapeOf({ shape: 'component' })?.id).toBe('uml-component')
    expect(shapeOf({ shape: 'mxgraph.c4.person2' })?.id).toBe('c4-person')
    expect(shapeOf(drawio('swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;html=1;'))?.id).toBe(
      'table',
    )
    expect(shapeOf(drawio('shape=cylinder3;whiteSpace=wrap;html=1;'))).toBeNull()
  })

  it('leave text, frames, lanes and unknown shapes without a group', () => {
    expect(shapeGroupOf(drawio('text;html=1;align=center;'))).toBeNull()
    expect(shapeGroupOf(findShape('boundary')!.style)).toBeNull()
    expect(shapeGroupOf(drawio('swimlane;startSize=23;'))).toBeNull()
    expect(shapeGroupOf(drawio('shape=mxgraph.aws4.lambda_function;'))).toBeNull()
  })
})
