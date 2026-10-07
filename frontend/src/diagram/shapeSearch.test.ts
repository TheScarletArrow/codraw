import { describe, expect, it } from 'vitest'
import { searchShapes, SHAPE_KEYWORDS } from './shapeSearch.ts'
import { SHAPE_SECTIONS } from './shapes.ts'

const labels = (query: string) => searchShapes(query).map((shape) => shape.label)

describe('searching shapes', () => {
  it('finds shapes by the technologies they stand for', () => {
    expect(labels('redis')).toEqual(['Кэш'])
    expect(labels('kafka')).toEqual(['Топик событий'])
    expect(labels('s3')).toEqual(['Хранилище объектов'])
    expect(labels('k8s')).toEqual(['Кластер Kubernetes'])
    expect(labels('postgres')).toContain('База данных')
  })

  it('finds shapes by the beginning of a word of their names, sections and English names', () => {
    expect(labels('табл')[0]).toBe('Таблица')
    expect(labels('балансир')).toEqual(['Балансировщик нагрузки'])
    expect(labels('load balancer')).toEqual(['Балансировщик нагрузки'])
    expect(labels('c4 database')).toEqual(['Database'])
    expect(labels('строки столбцы')).toEqual(['Сетка таблицы'])
    expect(labels('exclusive gateway')).toEqual(['Шлюз'])
    expect(labels('блок-схема условие')).toEqual(['Условие'])
  })

  it('takes upper and lower case and «ё» and «е» alike', () => {
    expect(labels('КЕШ')).toEqual(labels('кэш'))
    expect(labels('ТОПИК')).toEqual(['Топик событий'])
    expect(labels('скругленный')).toEqual(['Скруглённый прямоугольник'])
  })

  it('puts the shapes whose names match before the others', () => {
    const found = labels('база')
    expect(found[0]).toBe('База данных')
    expect(found).toContain('Таблица')
  })

  it('needs every word of the query, at the beginning of a word', () => {
    expect(labels('zzz')).toEqual([])
    expect(labels('ase')).toEqual([])
    expect(labels('   ')).toEqual([])
  })

  it('has words for every shape of the palette', () => {
    for (const shape of SHAPE_SECTIONS.flatMap((section) => section.shapes)) {
      expect(SHAPE_KEYWORDS[shape.id].length).toBeGreaterThan(0)
      expect(searchShapes(shape.label)).toContain(shape)
    }
  })
})
