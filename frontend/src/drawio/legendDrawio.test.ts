import { describe, expect, it } from 'vitest'
import { architectureModel, architectureSummary } from '../architecture/model.ts'
import { diffDocuments } from '../diagram/diff.ts'
import { INTERACTION_KEY } from '../diagram/elementKinds.ts'
import { LEGEND_KEY, LEGEND_PART_KEY, LEGEND_SHAPE, legendItems, legendSettings, legendSettingsValue } from '../diagram/legend.ts'
import { getCells, LAYER_CELL_ID, readCell, writeCell, type CellData } from '../diagram/model.ts'
import { boardWith, edgeData, laterState, shapeData } from '../diagram/testing.ts'
import { legendDrawioCells } from './legendDrawio.ts'
import { parseDrawio } from './parse.ts'
import { exportDrawio } from './serialize.ts'

const service = shapeData('s', 'a0', { value: 'Payments', style: { codrawShape: 'service', rounded: true } })
const db = shapeData('d', 'a1', { value: 'Ledger', style: { codrawShape: 'database', shape: 'cylinder' }, geometry: { x: 300, y: 0, width: 100, height: 90 } })
const call = edgeData('e', 'a2', 's', 'd', { style: { dashed: true, [INTERACTION_KEY]: 'async' } })
const legend = (style: Record<string, unknown> = {}): CellData =>
  shapeData('l', 'a3', { value: 'Легенда', style: { shape: LEGEND_SHAPE, codrawShape: 'legend', connectable: false, ...style }, geometry: { x: 500, y: 0, width: 200, height: 80 } })

describe('legends in files of draw.io', () => {
  it('writes a legend as a frame holding samples of shapes and edges, the line under its title and the names', () => {
    const settings = legendSettingsValue({ names: { 'shape:database': 'Хранилище' }, hidden: [] })!
    const cells = legendDrawioCells(legend({ [LEGEND_KEY]: settings }), [service, db, call])
    const [frame, line, ...parts] = cells
    expect(frame).toMatchObject({ id: 'l', value: 'Легенда', parent: LAYER_CELL_ID, geometry: { x: 500, y: 0 } })
    expect(frame!.style).toMatchObject({ codrawShape: 'legend', [LEGEND_KEY]: settings, container: true, fillColor: '#ffffff' })
    expect(frame!.style).not.toHaveProperty('shape')
    expect(line).toMatchObject({ parent: 'l', style: { shape: 'line', [LEGEND_PART_KEY]: true } })
    expect(parts.every((part) => part.parent === 'l' && part.style[LEGEND_PART_KEY] === true)).toBe(true)
    const names = parts.filter((part) => part.value !== '').map((part) => part.value)
    expect(names).toEqual(['Сервис', 'Хранилище', 'Асинхронная связь, пунктир'])
    const samples = parts.filter((part) => part.value === '')
    expect(samples.map((sample) => [sample.kind, sample.style.shape ?? null])).toEqual([
      ['vertex', null],
      ['vertex', 'cylinder'],
      ['edge', null],
    ])
    // Samples look like their cells, without what makes them cells of CoDraw; an edge has its ends at points.
    expect(samples[0]!.style).toMatchObject({ rounded: true })
    expect(Object.keys(samples[0]!.style).filter((key) => key.startsWith('codraw') && key !== LEGEND_PART_KEY)).toEqual([])
    expect(samples[2]).toMatchObject({ source: null, target: null, style: { dashed: true, edgeStyle: 'none' } })
    expect(samples[2]!.style).not.toHaveProperty(INTERACTION_KEY)
    expect(samples[2]!.geometry!.sourcePoint!.y).toBe(samples[2]!.geometry!.targetPoint!.y)
    // The frame is as large as its rows, whatever size the document had.
    expect(frame!.geometry!.height).toBeGreaterThan(names.length * 22)
  })

  it('goes to draw.io and comes back a legend without its parts, with its names and hidden items', async () => {
    const settings = legendSettingsValue({ names: { 'shape:service': 'API' }, hidden: ['shape:database'] })!
    const file = exportDrawio(boardWith(service, db, call, legend({ [LEGEND_KEY]: settings })))
    expect(file).toContain('codrawShape=legend')
    expect(file).toContain('value="API"')

    const [page] = await parseDrawio(file)
    const back = page!.cells
    expect(back.map((cell) => cell.id).sort()).toEqual(['d', 'e', 'l', 's'])
    const restored = back.find((cell) => cell.id === 'l')!
    expect(restored.style).toMatchObject({ shape: LEGEND_SHAPE, codrawShape: 'legend' })
    expect(restored.style).not.toHaveProperty('container')
    expect(legendSettings(restored.style)).toEqual({ names: { 'shape:service': 'API' }, hidden: ['shape:database'] })
    expect(legendItems(back.map((cell) => ({ ...cell, kind: cell.kind === 'edge' ? 'edge' : 'vertex' }))).map((item) => item.name)).toEqual([
      'Сервис',
      'База данных',
      'Асинхронная связь, пунктир',
    ])
  })

  it('keeps a frame of draw.io with the parts of nobody as it is', async () => {
    const xml = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="f" value="Рамка" style="container=1;" vertex="1" parent="1"><mxGeometry width="100" height="100" as="geometry"/></mxCell>
      <mxCell id="x" value="" style="codrawLegendPart=1;" vertex="1" parent="f"><mxGeometry width="10" height="10" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>`
    const [page] = await parseDrawio(xml)
    expect(page!.cells.map((cell) => cell.id)).toEqual(['f', 'x'])
  })
})

describe('legends elsewhere', () => {
  it('are not changed when only their size follows their items', () => {
    const version = boardWith(service, legend())
    const now = laterState(version, (doc) => {
      writeCell(getCells(doc), db)
      const stored = readCell('l', getCells(doc).get('l')!)
      writeCell(getCells(doc), { ...stored, geometry: { ...stored.geometry!, height: 150 } })
    })
    expect(diffDocuments(version, now).pages[0]!.cells.map((change) => [change.type, change.id])).toEqual([['added', 'd']])
    const moved = laterState(version, (doc) => {
      const stored = readCell('l', getCells(doc).get('l')!)
      writeCell(getCells(doc), { ...stored, geometry: { ...stored.geometry!, x: 10 } })
    })
    expect(diffDocuments(version, moved).pages[0]!.cells.map((change) => [change.type, change.id])).toEqual([['changed', 'l']])
  })

  it('are left out of the architecture as code without being counted', () => {
    const container = shapeData('c', 'b0', { value: 'API\n[Container: Kotlin]', style: { codrawShape: 'c4-container' } })
    const store = shapeData('b', 'b1', { value: 'DB\n[Container: PostgreSQL]', style: { codrawShape: 'c4-database' } })
    const model = architectureModel([container, store, edgeData('r', 'b2', 'c', 'b'), legend()], 'Доска')
    expect(architectureSummary(model)).toBe('Элементов: 2, границ: 0, связей: 1, пропущено фигур: 0')
  })
})
