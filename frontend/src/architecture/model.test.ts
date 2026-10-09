import { describe, expect, it } from 'vitest'
import { LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { architectureModel, architectureSummary, identifier, labelLines, modelElements, type ArchBoundary } from './model.ts'
import { c4Page, composePage } from './testPages.ts'

describe('identifier', () => {
  it('writes names in latin letters, digits and underscores', () => {
    expect(identifier('Веб-приложение', 'container')).toBe('veb_prilozhenie')
    expect(identifier('Платёжный шлюз', 'system')).toBe('platezhnyy_shlyuz')
    expect(identifier('Щука и ёж', 'x')).toBe('shchuka_i_ezh')
    expect(identifier(':services:billing', 'component')).toBe('services_billing')
    expect(identifier('3D-рендер', 'x')).toBe('e_3d_render')
    expect(identifier('???', 'container')).toBe('container')
  })
})

describe('labelLines', () => {
  it('reads the text of a label of HTML from draw.io', () => {
    const cell = { value: 'API<br>[Container: Kotlin &amp; Spring]<div><b>Заказы</b></div>', style: { html: 1 } } as unknown as CellData
    expect(labelLines(cell)).toEqual(['API', '[Container: Kotlin & Spring]', 'Заказы'])
  })
})

describe('architectureModel', () => {
  it('reads the elements of every layer of the page', () => {
    const page = c4Page()
    const layer: CellData = { id: 'infra', kind: 'layer', parent: '0', order: 'a5', value: 'Инфраструктура', geometry: null, source: null, target: null, style: {} }
    const moved = page.map((cell) => (cell.parent === LAYER_CELL_ID ? { ...cell, parent: layer.id } : cell))

    expect(architectureSummary(architectureModel([layer, ...moved], 'Магазин'))).toBe(
      architectureSummary(architectureModel(page, 'Магазин')),
    )
  })

  it('reads the template «C4: контейнеры»: a system with its containers, a person, an external system and relations', () => {
    const model = architectureModel(c4Page(), 'Магазин')

    expect(architectureSummary(model)).toBe('Элементов: 5, границ: 1, связей: 4, пропущено фигур: 0')
    const system = model.roots.find((node): node is ArchBoundary => node.type === 'boundary')!
    expect(system).toMatchObject({ kind: 'system', name: 'Интернет-магазин', id: 'internet_magazin' })
    expect(system.children.map((node) => node.type === 'element' && [node.kind, node.variant, node.name, node.technology])).toEqual([
      ['container', 'plain', 'Веб-приложение', 'React'],
      ['container', 'plain', 'API', 'Spring Boot'],
      ['container', 'database', 'База данных', 'PostgreSQL'],
    ])
    expect(modelElements(model).find((element) => element.name === 'API')!.description).toBe('Заказы, оплата и каталог')
    expect(modelElements(model).find((element) => element.kind === 'person')!.name).toBe('Покупатель')
    expect(modelElements(model).find((element) => element.external)).toMatchObject({ kind: 'system', name: 'Платёжный шлюз' })
    expect(model.relations.map((relation) => [relation.source.name, relation.target.name, relation.description, relation.technology])).toContainEqual([
      'Веб-приложение',
      'API',
      'Вызывает',
      'JSON/HTTPS',
    ])
  })

  it('reads shapes of the palette as the nearest elements of C4, and skips stickers, tables and links to fields', () => {
    const model = architectureModel(composePage(), 'Магазин')

    const group = model.roots[0] as ArchBoundary
    expect(group).toMatchObject({ kind: 'group', name: 'data' })
    expect(group.children.map((node) => node.type === 'element' && [node.kind, node.variant, node.name, node.description])).toEqual([
      ['container', 'database', 'postgres', 'postgres:18-alpine; :5432'],
      ['container', 'plain', 'backend', './backend'],
    ])
    expect(model.relations).toHaveLength(1)
    expect(model.relations[0]).toMatchObject({ description: 'JDBC', technology: '' })
    expect(architectureSummary(model)).toBe('Элементов: 2, границ: 1, связей: 1, пропущено фигур: 2')
  })

  it('nests frames by the smallest one around the centre, with the shapes of groups where the groups are', () => {
    const builder = new DiagramBuilder()
    builder.shape('kubernetes-cluster', 0, 0, { value: 'prod', width: 800, height: 500 })
    builder.shape('c4-boundary', 40, 40, { value: 'API\n[Container]', width: 400, height: 300 })
    builder.shape('c4-component', 60, 80, { value: 'Заказы\n[Component: Kotlin]' })
    builder.shape('user', 900, 0, { value: 'Оператор' })
    const cells = builder.build()
    // A group of shapes inside the cluster, whose shape lies relative to it.
    const cell = (id: string, parent: string, geometry: CellData['geometry'], style: CellData['style'], value = ''): CellData => ({
      id,
      kind: 'vertex',
      parent,
      order: 'a0',
      value,
      geometry,
      source: null,
      target: null,
      style,
    })
    const group = cell('group', LAYER_CELL_ID, { x: 500, y: 100, width: 200, height: 100 }, {})
    const service = cell('service', 'group', { x: 10, y: 10, width: 120, height: 60 }, { codrawShape: 'service' }, 'Склад')

    const model = architectureModel([...cells, group, service], 'Доска')

    const cluster = model.roots[0] as ArchBoundary
    expect(cluster).toMatchObject({ kind: 'group', name: 'prod' })
    expect(cluster.children.map((node) => [node.type, node.name])).toEqual([
      ['boundary', 'API'],
      ['element', 'Склад'],
    ])
    expect((cluster.children[0] as ArchBoundary).kind).toBe('container')
    expect(model.roots[1]).toMatchObject({ type: 'element', kind: 'person', name: 'Оператор' })
    expect(model.skipped).toBe(0)
  })

  it('gives elements with the same name different identifiers', () => {
    const builder = new DiagramBuilder()
    builder.shape('service', 0, 0, { value: 'Веб-приложение' })
    builder.shape('service', 200, 0, { value: 'Веб приложение' })

    expect(modelElements(architectureModel(builder.build(), 'Доска')).map((element) => element.id)).toEqual(['veb_prilozhenie', 'veb_prilozhenie_2'])
  })
})
