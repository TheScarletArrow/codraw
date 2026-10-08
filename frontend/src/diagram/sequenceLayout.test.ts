import { describe, expect, it } from 'vitest'
import { SequenceBuilder, type SequenceDiagram } from './sequence.ts'
import { BAR_SHIFT, BAR_WIDTH, HEADER_HEIGHT, ACTOR_HEADER_HEIGHT, layoutSequence, PADDING, type Box } from './sequenceLayout.ts'

/** Measures a text by its letters: 7 pixels each. */
const measure = (text: string) => Math.max(0, ...text.split('\n').map((line) => line.length * 7))

const lay = (diagram: SequenceDiagram) => layoutSequence(diagram, measure)
const below = (upper: Box, lower: Box) => lower.y >= upper.y + upper.height
const inside = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

function twoParties() {
  const builder = new SequenceBuilder('Вход')
  const a = builder.participant('A')
  const b = builder.participant('B')
  return { builder, a, b }
}

describe('layout of sequence diagrams', () => {
  it('puts participants from left to right with room between their headers and rows one under another', () => {
    const { builder, a, b } = twoParties()
    const first = builder.message(a, b, 'Запрос')
    const second = builder.message(b, a, 'Ответ', 'reply')
    const layout = lay(builder.diagram)
    const [pa, pb] = builder.diagram.participants.map((participant) => layout.participants.get(participant.id)!)
    expect(pa!.box.x).toBe(PADDING)
    expect(pb!.box.x).toBeGreaterThanOrEqual(pa!.box.x + pa!.box.width + 30)
    expect(pa!.box.height).toBe(HEADER_HEIGHT)
    const one = layout.steps.get(first.id)!.box
    const two = layout.steps.get(second.id)!.box
    expect(one.y).toBeGreaterThan(layout.lifelineTop)
    expect(below(one, two)).toBe(true)
    // An arrow goes from lifeline to lifeline: the first right, the answer back left.
    expect(layout.messages.get(first.id)).toMatchObject({ from: pa!.center, to: pb!.center, self: false, number: null })
    expect(layout.messages.get(second.id)).toMatchObject({ from: pb!.center, to: pa!.center })
    expect(layout.lifelineBottom).toBeGreaterThan(two.y + two.height)
    expect(layout.height).toBeGreaterThan(layout.lifelineBottom)
    expect(layout.width).toBeGreaterThan(pb!.box.x + pb!.box.width)
  })

  it('moves the rows under an inserted one down', () => {
    const { builder, a, b } = twoParties()
    const first = builder.message(a, b, 'Запрос')
    const last = builder.message(b, a, 'Ответ')
    const before = lay(builder.diagram).steps.get(last.id)!.box.y
    const inserted = builder.message(a, b, 'Проверка')
    builder.diagram.steps = [first, inserted, last]
    const after = lay(builder.diagram)
    expect(after.steps.get(inserted.id)!.box.y).toBe(before)
    expect(after.steps.get(last.id)!.box.y).toBeGreaterThan(before)
  })

  it('widens the gap between lifelines for a long label and keeps the label between them', () => {
    const { builder, a, b } = twoParties()
    const label = 'POST /api/v1/orders/{id}/payments'
    builder.message(a, b, label)
    const layout = lay(builder.diagram)
    const [pa, pb] = builder.diagram.participants.map((participant) => layout.participants.get(participant.id)!.center)
    expect(pb! - pa!).toBeGreaterThanOrEqual(measure(label) + 24)
  })

  it('gives the gap to the last pair of a span, after shorter spans took theirs', () => {
    const builder = new SequenceBuilder()
    const [a, b, c] = ['A', 'B', 'C'].map((name) => builder.participant(name)) as [string, string, string]
    builder.message(a, c, 'x'.repeat(60))
    const layout = lay(builder.diagram)
    const [ca, cb, cc] = builder.diagram.participants.map((participant) => layout.participants.get(participant.id)!.center)
    expect(cc! - ca!).toBeGreaterThanOrEqual(60 * 7 + 24)
    // The first gap stays as the headers need it.
    expect(cb! - ca!).toBe(90 + 30)
    expect(b).toBeDefined()
  })

  it('draws a call of oneself as a loop with its label right of the lifeline', () => {
    const { builder, a, b } = twoParties()
    const self = builder.message(a, a, 'Проверить подпись токена')
    const next = builder.message(a, b, 'Дальше')
    const layout = lay(builder.diagram)
    const message = layout.messages.get(self.id)!
    expect(message.self).toBe(true)
    expect(message.y2).toBeGreaterThan(message.y)
    const [ca, cb] = builder.diagram.participants.map((participant) => layout.participants.get(participant.id)!.center)
    expect(cb! - ca!).toBeGreaterThanOrEqual(measure('Проверить подпись токена') + 8)
    expect(below(layout.steps.get(self.id)!.box, layout.steps.get(next.id)!.box)).toBe(true)
  })

  it('numbers messages in a numbered diagram, without notes and frames', () => {
    const { builder, a, b } = twoParties()
    builder.diagram.numbered = true
    const first = builder.message(a, b, 'Запрос')
    builder.note(a, a, 'заметка')
    builder.frame('loop', 'каждую минуту')
    const second = builder.message(b, a, 'Ответ')
    builder.end()
    const layout = lay(builder.diagram)
    expect(layout.messages.get(first.id)!.number).toBe(1)
    expect(layout.messages.get(second.id)!.number).toBe(2)
  })

  it('draws bars of activation from the message that starts them to the one that ends them, nested ones shifted', () => {
    const { builder, a, b } = twoParties()
    const call = builder.message(a, b, 'Запрос', 'sync', { activate: [b] })
    const inner = builder.message(a, b, 'Ещё', 'sync', { activate: [b] })
    builder.message(b, a, 'Готово', 'reply', { deactivate: [b] })
    const answer = builder.message(b, a, 'Ответ', 'reply', { deactivate: [b] })
    const layout = lay(builder.diagram)
    const pb = layout.participants.get(builder.diagram.participants[1]!.id)!
    const bars = layout.bars.filter((bar) => bar.participant === builder.diagram.participants[1]!.id)
    expect(bars).toHaveLength(2)
    const outer = bars.find((bar) => bar.x === pb.center - BAR_WIDTH / 2)!
    const nested = bars.find((bar) => bar.x === pb.center - BAR_WIDTH / 2 + BAR_SHIFT)!
    expect(outer.top).toBe(layout.messages.get(call.id)!.y)
    expect(outer.bottom).toBe(layout.messages.get(answer.id)!.y)
    expect(nested.top).toBe(layout.messages.get(inner.id)!.y)
    // Arrows end at the edge of the bar they meet.
    expect(layout.messages.get(call.id)!.to).toBe(pb.center - BAR_WIDTH / 2)
    expect(layout.messages.get(answer.id)!.from).toBe(pb.center - BAR_WIDTH / 2)
  })

  it('ends an activation that no message ends near the end of the lifeline', () => {
    const { builder, a, b } = twoParties()
    builder.message(a, b, 'Запрос', 'sync', { activate: [b] })
    const layout = lay(builder.diagram)
    expect(layout.bars).toHaveLength(1)
    expect(layout.bars[0]!.bottom).toBeLessThan(layout.lifelineBottom)
    expect(layout.bars[0]!.bottom).toBeGreaterThan(layout.bars[0]!.top)
  })

  it('frames the rows of a frame and its branches, nested frames inside, and ends a frame without an end', () => {
    const { builder, a, b } = twoParties()
    builder.frame('alt', 'успех')
    const ok = builder.message(a, b, 'Данные')
    builder.branch('ошибка')
    builder.frame('loop', 'повтор')
    const retry = builder.message(a, b, 'Ещё раз')
    builder.end()
    builder.end()
    builder.frame('opt', '')
    const open = builder.message(b, a, 'Лог')
    const layout = lay(builder.diagram)
    const [alt, branch, loop, , , opt] = builder.diagram.steps.filter((step) => step.type !== 'message')
    const altBox = layout.steps.get(alt!.id)!.box
    const loopBox = layout.steps.get(loop!.id)!.box
    expect(inside(altBox, layout.steps.get(ok.id)!.box)).toBe(true)
    expect(inside(altBox, loopBox)).toBe(true)
    expect(inside(loopBox, layout.steps.get(retry.id)!.box)).toBe(true)
    expect(loopBox.x).toBeGreaterThan(altBox.x)
    const branchBox = layout.steps.get(branch!.id)!.box
    expect(branchBox).toMatchObject({ x: altBox.x, width: altBox.width })
    expect(layout.frames.get(alt!.id)!.branches).toEqual([branchBox.y - altBox.y])
    expect(inside(layout.steps.get(opt!.id)!.box, layout.steps.get(open.id)!.box)).toBe(true)
  })

  it('hides a branch and an end outside any frame', () => {
    const { builder, a, b } = twoParties()
    const first = builder.message(a, b, 'Запрос')
    builder.branch('сирота')
    builder.end()
    const last = builder.message(b, a, 'Ответ')
    const layout = lay(builder.diagram)
    const [, branch, end] = builder.diagram.steps
    expect(layout.steps.get(branch!.id)!.hidden).toBe(true)
    expect(layout.steps.get(end!.id)!.hidden).toBe(true)
    const gap = layout.steps.get(last.id)!.box.y - (layout.steps.get(first.id)!.box.y + layout.steps.get(first.id)!.box.height)
    expect(gap).toBe(0)
  })

  it('puts notes over one participant, over several, and beside one', () => {
    const builder = new SequenceBuilder()
    const [a, b] = ['Клиент', 'Сервис'].map((name) => builder.participant(name)) as [string, string]
    builder.note(a, a, 'над')
    builder.note(a, b, 'над обоими')
    builder.note(b, b, 'справа', 'right')
    builder.note(a, a, 'слева', 'left')
    const layout = lay(builder.diagram)
    const [ca, cb] = builder.diagram.participants.map((participant) => layout.participants.get(participant.id)!.center)
    const [over, both, right, left] = builder.diagram.steps.map((step) => layout.steps.get(step.id)!.box)
    expect(over!.x + over!.width / 2).toBeCloseTo(ca!, -1)
    expect(both!.x).toBeLessThan(ca!)
    expect(both!.x + both!.width).toBeGreaterThan(cb!)
    expect(right!.x).toBeGreaterThan(cb!)
    expect(left!.x + left!.width).toBeLessThan(ca!)
    // Everything is inside the diagram, the note left of the first participant too.
    expect(left!.x).toBeGreaterThanOrEqual(PADDING)
    expect(below(over!, both!) && below(both!, right!) && below(right!, left!)).toBe(true)
  })

  it('aligns the headers on their bottom: an actor is taller', () => {
    const builder = new SequenceBuilder()
    builder.participant('Пользователь', 'actor')
    builder.participant('API')
    const layout = lay(builder.diagram)
    const [actor, box] = builder.diagram.participants.map((participant) => layout.participants.get(participant.id)!.box)
    expect(actor!.height).toBe(ACTOR_HEADER_HEIGHT)
    expect(box!.y + box!.height).toBe(actor!.y + actor!.height)
    expect(layout.lifelineTop).toBe(actor!.y + actor!.height)
  })

  it('lays out a diagram without participants or rows', () => {
    const layout = lay(new SequenceBuilder('Пусто').diagram)
    expect(layout.width).toBeGreaterThanOrEqual(160)
    expect(layout.participants.size).toBe(0)
  })
})
