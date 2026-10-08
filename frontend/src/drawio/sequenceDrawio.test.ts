import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getCells, initializeDocument, LAYER_CELL_ID, writeCell } from '../diagram/model.ts'
import { SequenceBuilder, sequenceCells, SEQUENCE_SHAPE } from '../diagram/sequence.ts'
import { BAR_WIDTH } from '../diagram/sequenceLayout.ts'
import { parseDrawio, type DrawioCell } from './parse.ts'
import { exportDrawio, exportDrawioPage } from './serialize.ts'
import { sequenceDrawioCells } from './sequenceDrawio.ts'

/** Measures a text by its letters: 7 pixels each. */
const measure = (text: string) => Math.max(0, ...text.split('\n').map((line) => line.length * 7))

/** A diagram of a login: three participants, a frame with a branch, an activation, a call of oneself and a note. */
function login() {
  const builder = new SequenceBuilder('Вход', true)
  const user = builder.participant('Пользователь', 'actor')
  const app = builder.participant('Приложение', 'service')
  const db = builder.participant('БД', 'database')
  builder.message(user, app, 'Войти', 'sync', { activate: [app] })
  builder.message(app, app, 'Проверить')
  builder.frame('alt', 'есть')
  builder.message(app, db, 'SELECT', 'async')
  builder.branch('нет')
  builder.message(app, user, 'Ошибка', 'reply', { deactivate: [app] })
  builder.end()
  builder.note(user, app, 'cookie')
  return builder.diagram
}

function boardWith(cells: ReturnType<typeof sequenceCells>) {
  const doc = new Y.Doc()
  initializeDocument(doc)
  doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc), cell)))
  return doc
}

const styleOf = (cells: DrawioCell[], test: (style: Record<string, unknown>) => boolean) => cells.filter((cell) => test(cell.style))

describe('sequence diagrams in files of draw.io', () => {
  it('writes a diagram as a frame of draw.io holding lifelines, bars, frames, a branch, a note and messages', () => {
    const diagram = login()
    const [container, ...parts] = sequenceCells(diagram, { x: 40, y: 60 }, measure)
    const cells = sequenceDrawioCells(container!, parts, measure)
    const [frame] = cells
    expect(frame).toMatchObject({ id: container!.id, value: 'sd Вход', parent: LAYER_CELL_ID, style: { shape: 'umlFrame', container: true } })
    expect(frame!.style).not.toHaveProperty('codrawSeqNumbers')
    expect(frame!.geometry).toMatchObject({ x: 40, y: 60 })
    const inside = cells.slice(1)
    expect(inside.every((cell) => cell.parent === container!.id || cells.some((other) => other.id === cell.parent))).toBe(true)
    const lifelines = inside.filter((cell) => cell.style.shape === 'umlLifeline')
    expect(lifelines.map((cell) => [cell.value, cell.style.participant ?? null, cell.style.rounded ?? false])).toEqual([
      ['Пользователь', 'umlActor', false],
      ['Приложение', null, true],
      ['БД', 'cylinder', false],
    ])
    // Lifelines reach the end of the diagram, under the last row.
    expect(new Set(lifelines.map((cell) => cell.geometry!.y + cell.geometry!.height)).size).toBe(1)
    const bars = inside.filter((cell) => cell.style.perimeter === 'orthogonalPerimeter')
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ parent: lifelines[1]!.id, geometry: { width: BAR_WIDTH } })
    expect(inside.filter((cell) => cell.style.shape === 'umlFrame').map((cell) => cell.value)).toEqual(['alt'])
    expect(inside.find((cell) => cell.value === '[есть]')).toBeDefined()
    expect(inside.find((cell) => cell.style.shape === 'line')).toMatchObject({ value: '[нет]', style: { dashed: true } })
    expect(inside.find((cell) => cell.style.shape === 'note')).toMatchObject({ value: 'cookie', style: { fillColor: '#fff2cc' } })
    const edges = inside.filter((cell) => cell.kind === 'edge')
    expect(edges.map((edge) => edge.value)).toEqual(['1. Войти', '2. Проверить', '3. SELECT', '4. Ошибка'])
    expect(edges.map((edge) => [edge.style.endArrow, edge.style.dashed ?? false])).toEqual([
      ['block', false],
      ['block', false],
      ['open', false],
      ['open', true],
    ])
    // The call ends at the bar it starts; the answer leaves it; a call of oneself goes around its loop.
    expect(edges[0]!.target).toBe(bars[0]!.id)
    expect(edges[0]!.style).toMatchObject({ entryX: 0, entryPerimeter: false })
    expect(edges[3]!.source).toBe(bars[0]!.id)
    expect(edges[1]!.geometry!.points).toHaveLength(2)
    // A message from an activated participant leaves its bar, and ends on the lifeline of one without a bar.
    expect(edges[2]).toMatchObject({ source: bars[0]!.id, target: lifelines[2]!.id, style: { exitX: 1, entryX: 0.5, edgeStyle: 'none' } })
  })

  it('writes the diagram of a page into .drawio as shapes of draw.io, which a file brings back as ordinary shapes', async () => {
    const doc = boardWith(sequenceCells(login(), { x: 0, y: 0 }, measure))
    const xml = exportDrawio(doc)
    expect(xml).toContain('shape=umlLifeline')
    expect(xml).toContain('shape=umlFrame')
    expect(xml).not.toContain(SEQUENCE_SHAPE)
    expect(xml).not.toContain('codrawSeq')
    const [page] = await parseDrawio(xml)
    const cells = page!.cells
    expect(styleOf(cells, (style) => style.shape === 'umlLifeline')).toHaveLength(3)
    expect(styleOf(cells, (style) => style.shape === 'umlFrame')).toHaveLength(2)
    const edges = cells.filter((cell) => cell.kind === 'edge')
    expect(edges).toHaveLength(4)
    expect(edges.every((edge) => edge.source !== null && edge.target !== null)).toBe(true)
    expect(edges[3]!.style).toMatchObject({ endArrow: 'open', dashed: true, edgeStyle: 'none' })
  })

  it('writes the diagram when it is the selection of a page', () => {
    const cells = sequenceCells(login(), { x: 0, y: 0 }, measure)
    const doc = boardWith(cells)
    const xml = exportDrawioPage(doc, 'page-1', [cells[0]!.id])!
    expect(xml.match(/shape=umlLifeline/g)).toHaveLength(3)
  })

  it('writes the diagram again from its parts, not from the geometry they keep', () => {
    const cells = sequenceCells(login(), { x: 0, y: 0 }, measure)
    // As after two participants inserted rows at once: two messages kept the same place.
    const messages = cells.filter((cell) => cell.style.codrawSeq === 'message')
    messages[1]!.geometry = { ...messages[0]!.geometry! }
    const [container, ...parts] = cells
    const edges = sequenceDrawioCells(container!, parts, measure).filter((cell) => cell.kind === 'edge')
    const ys = edges.map((edge) => edge.geometry!.sourcePoint!.y)
    expect(new Set(ys).size).toBe(ys.length)
  })
})
