import { describe, expect, it } from 'vitest'
import { setLocale } from '../i18n/i18n.ts'
import { INTERACTION_KEY, TECHNOLOGY_KEY } from './elementKinds.ts'
import { FREEHAND_KEY } from './freehand.ts'
import {
  colorWord,
  isLegendStyle,
  layoutLegend,
  LEGEND_KEY,
  LEGEND_MIN_WIDTH,
  LEGEND_PADDING,
  LEGEND_SAMPLE,
  LEGEND_SHAPE,
  legendItems,
  legendRows,
  legendSettings,
  legendSettingsValue,
  MAX_LEGEND_ROWS,
  sameLegendLayout,
  sampleBox,
  type LegendRecord,
} from './legend.ts'
import { ELEMENT_STYLE_KEYS } from './model.ts'
import { SEQUENCE_SHAPE } from './sequence.ts'
import { TABLE_STYLE } from './shapes.ts'

/** Measures a text by its letters: 7 pixels each, 8 in bold. */
const measure = (text: string, style: { fontStyle?: unknown }) => text.length * (Number(style.fontStyle) & 1 ? 8 : 7)

const shape = (id: string, codrawShape: string, style: Record<string, unknown> = {}, parent: string | null = '1'): LegendRecord => ({
  id,
  kind: 'vertex',
  parent,
  style: { codrawShape, ...style },
})
const edge = (id: string, style: Record<string, unknown> = {}): LegendRecord => ({ id, kind: 'edge', parent: '1', style })

const names = (records: LegendRecord[]) => legendItems(records).map((item) => item.name)

describe('the items of a legend', () => {
  it('lists the kinds of shapes in the order of the palette, each once, with the first cell as its sample', () => {
    const items = legendItems([shape('c1', 'cache'), shape('s1', 'service'), shape('s2', 'service'), shape('d', 'database')])
    expect(items.map(({ key, name, cellId, type }) => ({ key, name, cellId, type }))).toEqual([
      { key: 'shape:service', name: 'Сервис', cellId: 's1', type: 'shape' },
      { key: 'shape:database', name: 'База данных', cellId: 'd', type: 'shape' },
      { key: 'shape:cache', name: 'Кэш', cellId: 'c1', type: 'shape' },
    ])
  })

  it('tells a fill other than that of the palette by its color in words', () => {
    expect(names([shape('a', 'service'), shape('b', 'service', { fillColor: '#F8CECC' }), shape('c', 'service', { fillColor: '#ffffff' })])).toEqual([
      'Сервис',
      'Сервис, розовый',
    ])
    // A color of no name of the palette is written as it is; a shape of C4 has its own fill.
    expect(names([shape('a', 'c4-container', { fillColor: '#438DD5' }), shape('b', 'c4-container', { fillColor: '#123456' })])).toEqual([
      'Container',
      'Container, #123456',
    ])
    expect(names([shape('a', 'service', { fillColor: 'none' })])).toEqual(['Сервис, без заливки'])
    expect(colorWord('#b85450')).toBe('красный')
  })

  it('names a shape by the kind of its element when the kind is not the shape, but not a frame', () => {
    const items = legendItems([
      shape('r', 'rectangle', { [ELEMENT_STYLE_KEYS.kind]: 'c4-container' }),
      shape('s', 'service', { [ELEMENT_STYLE_KEYS.kind]: 'service' }),
      shape('b', 'c4-boundary', { [ELEMENT_STYLE_KEYS.kind]: 'c4-container' }),
    ])
    expect(items.map((item) => [item.key, item.name])).toEqual([
      ['shape:rectangle|kind:c4-container', 'Container'],
      ['shape:service', 'Сервис'],
      ['shape:c4-boundary', 'Граница системы'],
    ])
  })

  it('lists a logo of the palette, but not a picture of the participant', () => {
    const logo = { id: 'k', kind: 'vertex' as const, parent: '1', style: { shape: 'image', image: 'data:image/svg+xml;base64,PHN2Zy8+', codrawShape: 'provider-kafka' } }
    const picture = { id: 'p', kind: 'vertex' as const, parent: '1', style: { shape: 'image', image: 'https://example.com/a.png' } }
    expect(legendItems([picture, logo]).map((item) => [item.key, item.name])).toEqual([['shape:provider-kafka', 'Kafka']])
  })

  it('leaves out text, stickies, pictures, tables with their fields, sequence diagrams, groups, labels and legends', () => {
    const items = legendItems([
      shape('t', 'text'),
      shape('n', 'sticky'),
      shape('l', 'list'),
      { id: 'img', kind: 'vertex', parent: '1', style: { shape: 'image', image: 'https://example.com/a.png' } },
      { id: 'tab', kind: 'vertex', parent: '1', style: { ...TABLE_STYLE, codrawShape: 'table' } },
      { id: 'field', kind: 'vertex', parent: 'tab', style: { fillColor: 'none', strokeColor: 'none' } },
      { id: 'seq', kind: 'vertex', parent: '1', style: { shape: SEQUENCE_SHAPE, codrawShape: 'sequence' } },
      { id: 'part', kind: 'vertex', parent: 'seq', style: { codrawSeq: 'participant' } },
      { id: 'group', kind: 'vertex', parent: '1', style: { fillColor: 'none', strokeColor: 'none' } },
      edge('e'),
      { id: 'label', kind: 'vertex', parent: 'e', style: { codrawShape: 'service' } },
      { id: 'legend', kind: 'vertex', parent: '1', style: { shape: LEGEND_SHAPE, codrawShape: 'legend' } },
      shape('inside', 'service', {}, 'group'),
    ])
    expect(items.map((item) => item.cellId)).toEqual(['tab', 'inside', 'e'])
  })

  it('lists edges by line, markers, color, interaction and technology after the shapes', () => {
    const items = legendItems([
      edge('plain'),
      edge('plain2', { edgeStyle: 'none', strokeColor: '#1F2328' }),
      edge('async', { dashed: true, [INTERACTION_KEY]: 'async', [TECHNOLOGY_KEY]: 'Kafka' }),
      edge('none', { endArrow: 'none' }),
      edge('both', { startArrow: 'classic', strokeColor: '#b85450' }),
      edge('hand', { [FREEHAND_KEY]: true }),
      shape('s', 'service'),
    ])
    expect(items.map((item) => [item.cellId, item.name])).toEqual([
      ['s', 'Сервис'],
      ['async', 'Асинхронная связь, пунктир [Kafka]'],
      ['plain', 'Связь'],
      ['none', 'Связь, без стрелки'],
      ['both', 'Связь, в обе стороны, красный'],
    ])
  })

  it('names the open arrow and the hollow triangle of relations of use cases, apart from a filled triangle', () => {
    const items = legendItems([
      edge('association', { endArrow: 'none' }),
      edge('generalization', { endArrow: 'block', endFill: false, endSize: 16 }),
      edge('include', { dashed: true, endArrow: 'open', endSize: 12 }),
      edge('extend', { dashed: true, endArrow: 'open', endSize: 12 }),
      edge('filled', { endArrow: 'block' }),
      edge('hollow', { endArrow: 'block', endFill: 0 }),
    ])

    expect(items.map((item) => [item.cellId, item.name])).toEqual([
      ['filled', 'Связь'],
      ['association', 'Связь, без стрелки'],
      ['generalization', 'Связь, полый треугольник'],
      ['include', 'Связь, пунктир, открытая стрелка'],
    ])
    // A filled and a hollow triangle are two kinds; the sizes of the markers are not.
    expect(new Set(items.map((item) => item.key)).size).toBe(4)
  })

  it('orders the items the same whatever the order of the cells', () => {
    const records = [shape('a', 'queue'), edge('e', { dashed: 1 }), shape('b', 'user'), edge('f'), shape('c', 'service', { fillColor: '#dae8fc' })]
    expect(legendItems([...records].reverse()).map((item) => item.key)).toEqual(legendItems(records).map((item) => item.key))
  })
})

describe('the settings of a legend', () => {
  it('goes through a style of draw.io as it is and back', () => {
    const value = legendSettingsValue({ names: { 'shape:cache': 'Redis; кэш = быстро', 'edge:x': '  ' }, hidden: ['shape:service', 'shape:service'] })!
    expect(value).not.toMatch(/[;=,]/)
    expect(legendSettings({ [LEGEND_KEY]: value })).toEqual({ names: { 'shape:cache': 'Redis; кэш = быстро' }, hidden: ['shape:service'] })
  })

  it('writes nothing for a legend nobody changed and reads anything else as nothing', () => {
    expect(legendSettingsValue({ names: {}, hidden: [] })).toBeUndefined()
    expect(legendSettings({ [LEGEND_KEY]: '%E0%A4%A' })).toEqual({ names: {}, hidden: [] })
    expect(legendSettings({ [LEGEND_KEY]: encodeURIComponent('[1,2]') })).toEqual({ names: {}, hidden: [] })
    expect(legendSettings({ [LEGEND_KEY]: encodeURIComponent('{"names":{"a":5,"b":"Б\\nВ"},"hidden":[1,"c"]}') })).toEqual({
      names: { b: 'Б В' },
      hidden: ['c'],
    })
  })

  it('tells a legend by its mark or its shape', () => {
    expect(isLegendStyle({ codrawShape: 'legend' })).toBe(true)
    expect(isLegendStyle({ shape: LEGEND_SHAPE })).toBe(true)
    expect(isLegendStyle({ codrawShape: 'service' })).toBe(false)
  })
})

describe('the rows and the layout of a legend', () => {
  const items = legendItems([shape('s', 'service'), shape('c', 'cache'), edge('e', { dashed: true })])

  it('shows the items that are not hidden under the names given to them', () => {
    const rows = legendRows(items, { names: { 'shape:cache': 'Redis' }, hidden: ['shape:service'] })
    expect(rows.map((row) => [row.type, row.label])).toEqual([
      ['shape', 'Redis'],
      ['edge', 'Связь, пунктир'],
    ])
  })

  it('says so when it has nothing to show, and counts what is beyond its limit', () => {
    expect(legendRows([], { names: {}, hidden: [] })).toEqual([{ type: 'empty', key: null, label: 'Нет фигур и связей', cellId: null, ratio: 1 }])
    expect(legendRows(items, { names: {}, hidden: items.map((item) => item.key) })[0]!.type).toBe('empty')
    const many = Array.from({ length: MAX_LEGEND_ROWS + 3 }, (_, index) => edge(`e${index}`, { [TECHNOLOGY_KEY]: `T${String(index).padStart(2, '0')}` }))
    const rows = legendRows(legendItems(many), { names: {}, hidden: [] })
    expect(rows).toHaveLength(MAX_LEGEND_ROWS + 1)
    expect(rows.at(-1)).toMatchObject({ type: 'more', label: '…и ещё 3' })
  })

  it('is as wide as its longest name and as high as its rows', () => {
    const rows = legendRows(items, { names: { 'edge:x': 'x' }, hidden: [] })
    const layout = layoutLegend('Легенда', rows, { fontSize: 13 }, measure)
    expect(layout.rows.map((row) => row.y)).toEqual([layout.header, layout.header + 30, layout.header + 60])
    expect(layout.height).toBe(layout.header + 90 + LEGEND_PADDING / 2)
    expect(layout.width).toBe(layout.textX + 'Связь, пунктир'.length * 7 + LEGEND_PADDING)
    expect(layoutLegend('Легенда', legendRows(items.slice(0, 1), { names: {}, hidden: [] }), {}, measure).width).toBe(LEGEND_MIN_WIDTH)
    const long = layoutLegend('Легенда', legendRows(items, { names: { 'shape:service': 'Очень длинное имя сервиса для легенды' }, hidden: [] }), {}, measure)
    expect(long.width).toBe(layout.textX + 'Очень длинное имя сервиса для легенды'.length * 7 + LEGEND_PADDING)
    // A long title widens it too, measured in bold.
    expect(layoutLegend('Условные обозначения схемы платежей', rows, {}, measure).width).toBe(2 * LEGEND_PADDING + 35 * 8)
    expect(sameLegendLayout(layout, layoutLegend('Легенда', rows, { fontSize: 13 }, measure))).toBe(true)
    expect(sameLegendLayout(layout, long)).toBe(false)
  })

  it('fits the sample of a shape into its room as the shape of the palette is', () => {
    const wide = sampleBox(4, 0, 30)
    expect(wide).toEqual({ x: LEGEND_PADDING, y: (30 - LEGEND_SAMPLE.width / 4) / 2, width: LEGEND_SAMPLE.width, height: LEGEND_SAMPLE.width / 4 })
    const tall = sampleBox(0.5, 10, 30)
    expect(tall.height).toBe(LEGEND_SAMPLE.height)
    expect(tall.width).toBe(LEGEND_SAMPLE.height / 2)
    expect(tall.y).toBe(10 + (30 - LEGEND_SAMPLE.height) / 2)
  })
})

describe('a legend in English', () => {
  it('names edges, colors and the rows beyond the limit in English', () => {
    setLocale('en')
    expect(colorWord('#b85450')).toBe('red')
    expect(colorWord('none')).toBe('no fill')
    const items = Array.from({ length: MAX_LEGEND_ROWS + 2 }, (_, index) => ({
      key: `k${index}`,
      type: 'shape' as const,
      name: `n${index}`,
      cellId: `c${index}`,
      ratio: 1,
    }))
    expect(legendRows(items, { names: {}, hidden: [] }).at(-1)!.label).toBe('…and 2 more')
    expect(legendRows([], { names: {}, hidden: [] })[0]!.label).toBe('No shapes or connectors')
  })
})
