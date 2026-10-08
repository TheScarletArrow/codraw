import { describe, expect, it } from 'vitest'
import { compareCells, LAYER_CELL_ID } from './model.ts'
import {
  ACTIVATE_KEY,
  ARROW_KEY,
  DEACTIVATE_KEY,
  FROM_KEY,
  isSequenceStyle,
  keyList,
  messageLabel,
  NUMBERS_KEY,
  PART_KEY,
  PARTICIPANT_KEY,
  PARTICIPANT_KIND_KEY,
  readSequence,
  SEQUENCE_SHAPE,
  SequenceBuilder,
  sequenceCells,
  sequencePartOf,
  starterSequence,
  TO_KEY,
  type PartRecord,
} from './sequence.ts'

/** Measures a text by its letters: 7 pixels each. */
const measure = (text: string) => Math.max(0, ...text.split('\n').map((line) => line.length * 7))

const part = (id: string, value: string, style: Record<string, unknown>): PartRecord => ({ id, value, style })
const diagram = (style: Record<string, unknown> = {}): PartRecord => part('d', 'Вход', { shape: SEQUENCE_SHAPE, ...style })

describe('sequence diagrams as cells', () => {
  it('reads participants in their order and rows in theirs, leaving out cells that are no parts', () => {
    const read = readSequence(diagram({ [NUMBERS_KEY]: 1 }), [
      part('p1', 'Клиент', { [PART_KEY]: 'participant', [PARTICIPANT_KEY]: 'a' }),
      part('m1', 'Запрос', { [PART_KEY]: 'message', [FROM_KEY]: 'a', [TO_KEY]: 'b', [ACTIVATE_KEY]: ['b'] }),
      part('x', 'чужая', { fillColor: 'red' }),
      part('p2', 'БД', { [PART_KEY]: 'participant', [PARTICIPANT_KEY]: 'b', [PARTICIPANT_KIND_KEY]: 'database', fontSize: 16 }),
      part('m2', 'Ответ', { [PART_KEY]: 'message', [FROM_KEY]: 'b', [TO_KEY]: 'a', [ARROW_KEY]: 'reply', [DEACTIVATE_KEY]: 'b' }),
    ])
    expect(read.title).toBe('Вход')
    expect(read.numbered).toBe(true)
    expect(read.participants.map(({ id, key, name, kind }) => ({ id, key, name, kind }))).toEqual([
      { id: 'p1', key: 'a', name: 'Клиент', kind: 'participant' },
      { id: 'p2', key: 'b', name: 'БД', kind: 'database' },
    ])
    expect(read.participants[1]!.font).toEqual({ fontSize: 16 })
    expect(read.steps).toMatchObject([
      { type: 'message', id: 'm1', from: 'a', to: 'b', arrow: 'sync', activate: ['b'], deactivate: [] },
      { type: 'message', id: 'm2', from: 'b', to: 'a', arrow: 'reply', activate: [], deactivate: ['b'] },
    ])
  })

  it('reads values that are not what they should be as their defaults', () => {
    const read = readSequence(diagram(), [
      part('p1', 'A', { [PART_KEY]: 'participant', [PARTICIPANT_KEY]: 'a', [PARTICIPANT_KIND_KEY]: 'robot' }),
      // A participant whose key another one has is named by none.
      part('p2', 'B', { [PART_KEY]: 'participant', [PARTICIPANT_KEY]: 'a' }),
      part('m', 'x', { [PART_KEY]: 'message', [FROM_KEY]: 'gone', [TO_KEY]: 'p2', [ARROW_KEY]: 'boom', [ACTIVATE_KEY]: ['gone', 'p2'] }),
      part('n', 'note', { [PART_KEY]: 'note', [FROM_KEY]: 'a', codrawSeqNote: 'under' }),
      part('f', 'cond', { [PART_KEY]: 'frame', codrawSeqFrame: 'while' }),
      part('q', '?', { [PART_KEY]: 'mystery' }),
    ])
    expect(read.participants.map((participant) => [participant.key, participant.kind])).toEqual([
      ['a', 'participant'],
      ['p2', 'participant'],
    ])
    expect(read.steps).toMatchObject([
      { type: 'message', from: 'a', to: 'p2', arrow: 'sync', activate: ['p2'] },
      { type: 'note', placement: 'over', from: 'a', to: 'a' },
      { type: 'frame', kind: 'opt', text: 'cond' },
    ])
    expect(isSequenceStyle(diagram().style)).toBe(true)
    expect(sequencePartOf({ [PART_KEY]: 'end' })).toBe('end')
    expect(sequencePartOf({ [PART_KEY]: 'mystery' })).toBeNull()
  })

  it('takes lists of keys as arrays and as the words of a file of draw.io', () => {
    expect(keyList(['a', 'b', 'a', ''])).toEqual(['a', 'b'])
    expect(keyList('a, b,c')).toEqual(['a', 'b', 'c'])
    expect(keyList(1)).toEqual([])
  })

  it('writes a diagram as cells ordered as they come, which read back the same', () => {
    const builder = new SequenceBuilder('Сценарий', true)
    const user = builder.participant('Пользователь', 'actor')
    const app = builder.participant('Приложение', 'service')
    builder.message(user, app, 'Вход', 'sync', { activate: [app] })
    builder.frame('alt', 'успех')
    builder.message(app, user, 'Токен', 'reply', { deactivate: [app] })
    builder.branch('ошибка')
    builder.note(user, app, 'Повторить', 'over')
    builder.end()
    const cells = sequenceCells(builder.diagram, { x: 100, y: 50 }, measure)
    const [container, ...parts] = cells
    expect(container).toMatchObject({ parent: LAYER_CELL_ID, value: 'Сценарий', style: { shape: SEQUENCE_SHAPE, codrawShape: 'sequence', [NUMBERS_KEY]: true } })
    expect(container!.geometry).toMatchObject({ x: 100, y: 50 })
    expect(parts.every((cell) => cell.parent === container!.id)).toBe(true)
    const sorted = [...parts].sort(compareCells)
    expect(sorted.map((cell) => cell.value)).toEqual(['Пользователь', 'Приложение', 'Вход', 'успех', 'Токен', 'ошибка', 'Повторить', ''])
    const read = readSequence(container!, sorted)
    expect(read.participants.map((participant) => [participant.name, participant.kind, participant.key])).toEqual([
      ['Пользователь', 'actor', user],
      ['Приложение', 'service', app],
    ])
    expect(read.steps.map((step) => step.type)).toEqual(['message', 'frame', 'message', 'else', 'note', 'end'])
    expect(read.steps[2]).toMatchObject({ from: app, to: user, arrow: 'reply', deactivate: [app] })
    // The geometry is the layout: the first message under the headers, the second under the first.
    const [first, second] = [sorted[2]!.geometry!, sorted[4]!.geometry!]
    expect(second.y).toBeGreaterThan(first.y + first.height)
  })

  it('starts a new diagram with a call and an answer between two participants', () => {
    const starter = starterSequence()
    expect(starter.title).toBe('Сценарий')
    expect(starter.participants.map((participant) => participant.name)).toEqual(['Клиент', 'Сервис'])
    const [client, service] = starter.participants.map((participant) => participant.key)
    expect(starter.steps).toMatchObject([
      { type: 'message', text: 'Запрос', from: client, to: service, arrow: 'sync' },
      { type: 'message', text: 'Ответ', from: service, to: client, arrow: 'reply' },
    ])
    expect(new Set(starterSequence().participants.map((participant) => participant.key)).has(client!)).toBe(false)
  })

  it('numbers the label of a message only in a numbered diagram', () => {
    expect(messageLabel('Запрос', 2)).toBe('2. Запрос')
    expect(messageLabel('Запрос', null)).toBe('Запрос')
  })
})
