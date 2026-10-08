import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ELEMENT_KEY } from '../diagram/model.ts'
import { getCells, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { boardWith as stateWith, edgeData, shapeData } from '../diagram/testing.ts'
import { dependencies, dependencyGraph, placeKey, shortestPaths } from './dependencies.ts'

const sample = () => stateWith(
  shapeData('a', 'a1', { value: 'A' }), shapeData('b', 'a2', { value: 'B' }),
  shapeData('c', 'a3', { value: 'C' }), shapeData('d', 'a4', { value: 'D' }), shapeData('x', 'a5', { value: 'X' }),
  edgeData('ab', 'a6', 'a', 'b'), edgeData('ac', 'a7', 'a', 'c'),
  edgeData('bd', 'a8', 'b', 'd'), edgeData('cd', 'a9', 'c', 'd'), edgeData('da', 'b1', 'd', 'a'),
)
const key = (graph: ReturnType<typeof dependencyGraph>, id: string, page = 'page-1') => graph.cells.get(placeKey(page, id))!

describe('Анализ зависимостей', () => {
  it('limits depth and traverses cycles once, independently in both directions', () => {
    const graph = dependencyGraph(sample())
    const start = key(graph, 'a')
    expect([...dependencies(graph, start, 1).nodes].sort()).toEqual([key(graph, 'b'), key(graph, 'c')].sort())
    expect(dependencies(graph, start, 2).nodes).toEqual(new Set([key(graph, 'b'), key(graph, 'c'), key(graph, 'd')]))
    expect(dependencies(graph, start, Infinity).nodes.size).toBe(3)
    expect(dependencies(graph, start, 1, true).nodes).toEqual(new Set([key(graph, 'd')]))
    expect(dependencies(graph, 'missing', Infinity).nodes.size).toBe(0)
  })

  it('marks every shortest path without including a cycle or disconnected node', () => {
    const graph = dependencyGraph(sample())
    const path = shortestPaths(graph, key(graph, 'a'), key(graph, 'd'))
    expect(path.nodes.size).toBe(4)
    expect(path.edges).toEqual(new Set(['page-1:ab', 'page-1:ac', 'page-1:bd', 'page-1:cd']))
    expect(shortestPaths(graph, key(graph, 'a'), key(graph, 'x')).nodes.size).toBe(0)
    expect(shortestPaths(graph, key(graph, 'a'), key(graph, 'a')).nodes).toEqual(new Set([key(graph, 'a')]))
  })

  it('joins shared identities across pages while equal names stay independent', () => {
    const doc = sample()
    ;(getCells(doc).get('b')!.get('style') as Y.Map<unknown>).set(ELEMENT_KEY, 'shared-b')
    const other = addPage(doc)
    writeCell(getCells(doc, other), shapeData('copy-b', 'a1', { value: 'B', style: { [ELEMENT_KEY]: 'shared-b' } }))
    writeCell(getCells(doc, other), shapeData('another-b', 'a2', { value: 'B' }))
    writeCell(getCells(doc, other), edgeData('to-other', 'a3', 'copy-b', 'another-b'))
    const before = Y.encodeStateAsUpdate(doc)
    const graph = dependencyGraph(doc)
    expect(key(graph, 'b')).toBe(key(graph, 'copy-b', other))
    expect(key(graph, 'b')).not.toBe(key(graph, 'another-b', other))
    expect(graph.nodes.get(key(graph, 'b'))!.places).toHaveLength(2)
    expect(dependencies(graph, key(graph, 'a'), 2).nodes.has(key(graph, 'another-b', other))).toBe(true)
    expect(dependencyGraph(doc, 'page-1').nodes.size).toBe(5)
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
  })

  it('allows transport dependencies in both directions and strict arrow traversal', () => {
    const doc = stateWith(
      shapeData('producer', 'a1'), shapeData('queue', 'a2', { style: { codrawShape: 'queue' } }), shapeData('consumer', 'a3'),
      edgeData('send', 'a4', 'producer', 'queue'), edgeData('receive', 'a5', 'queue', 'consumer'),
    )
    const graph = dependencyGraph(doc)
    expect(dependencies(graph, key(graph, 'consumer'), 1).nodes).toEqual(new Set([key(graph, 'queue')]))
    const strict = dependencyGraph(doc, undefined, false)
    expect(dependencies(strict, key(strict, 'consumer'), Infinity).nodes.size).toBe(0)
  })

  it('resolves table fields to the table and ignores dangling connectors and edge labels', () => {
    const doc = stateWith(shapeData('table', 'a1', { style: { codrawShape: 'table', childLayout: 'stackLayout' } }),
      shapeData('field', 'a2', { parent: 'table' }), shapeData('api', 'a3'),
      edgeData('call', 'a4', 'api', 'field'), edgeData('dangling', 'a5', 'api', 'missing'),
      shapeData('label', 'a6', { parent: 'call' }))
    const graph = dependencyGraph(doc)
    expect(graph.cells.has(placeKey('page-1', 'label'))).toBe(false)
    expect(graph.cells.has(placeKey('page-1', 'field'))).toBe(false)
    expect(graph.edges.map((edge) => edge.key)).toEqual(['page-1:call'])
  })
})
