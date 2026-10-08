import { describe, expect, it } from 'vitest'
import { diffDocuments, type PageDiff } from '../diagram/diff.ts'
import { getCells, writeCell, type CellData } from '../diagram/model.ts'
import { ARROW_KEY, SequenceBuilder, sequenceCells, TO_KEY } from '../diagram/sequence.ts'
import { boardWith, laterState } from '../diagram/testing.ts'
import { changeItems } from './changes.ts'

/** Measures a text by its letters: 7 pixels each. */
const measure = (text: string) => text.length * 7

const firstPage = (before: Parameters<typeof diffDocuments>[0], after: Parameters<typeof diffDocuments>[1]): PageDiff =>
  diffDocuments(before, after).pages[0]!

/** A diagram of two participants with a call and an answer, and the same with a message inserted between them. */
function diagrams() {
  const builder = new SequenceBuilder('Вход')
  const client = builder.participant('Клиент')
  const service = builder.participant('Сервис')
  const request = builder.message(client, service, 'Запрос')
  const answer = builder.message(service, client, 'Ответ', 'reply')
  const before = sequenceCells(builder.diagram, { x: 0, y: 0 }, measure)
  const inserted = builder.message(client, service, 'Проверка')
  builder.diagram.steps = [request, inserted, answer]
  // The same diagram laid out again: the parts keep their ids, the new one is laid out between the others.
  const after = sequenceCells(builder.diagram, { x: 0, y: 0 }, measure)
  const container = before[0]!.id
  const same = (cells: CellData[]) => cells.map((cell) => (cell.id === after[0]!.id ? { ...cell, id: container } : cell.parent === after[0]!.id ? { ...cell, parent: container } : cell))
  return { before, after: same(after), inserted, service }
}

describe('sequence diagrams in the list of changes', () => {
  it('finds one message inserted in the middle, not the rows it moved down or the longer lifelines and diagram', () => {
    const { before, after, inserted } = diagrams()
    const version = boardWith(...before)
    const now = laterState(version, (doc) => {
      // The order keys of the version stay; the new message gets one between its neighbours.
      const orders = new Map(before.map((cell) => [cell.id, cell.order]))
      const keys = before.filter((cell) => cell.style.codrawSeq === 'message').map((cell) => cell.order)
      for (const cell of after) {
        const order = orders.get(cell.id) ?? `${keys[0]}V`
        writeCell(getCells(doc), { ...cell, order })
      }
    })
    const page = firstPage(version, now)
    expect(page.cells.map((change) => [change.type, change.id])).toEqual([['added', inserted.id]])
    expect(changeItems(page).map(({ title, kind }) => [title, kind])).toEqual([['Проверка', 'Сообщение']])
  })

  it('names the parts by their kinds and their changes by words', () => {
    const { before } = diagrams()
    const version = boardWith(...before)
    const message = before.find((cell) => cell.value === 'Запрос')!
    const participant = before.find((cell) => cell.value === 'Клиент')!
    const now = laterState(version, (doc) => {
      writeCell(getCells(doc), { ...message, style: { ...message.style, [ARROW_KEY]: 'async', [TO_KEY]: participant.style.codrawSeqKey! } })
      writeCell(getCells(doc), { ...participant, value: 'Браузер' })
      writeCell(getCells(doc), { ...before[0]!, value: 'Вход через OAuth', style: { ...before[0]!.style, codrawSeqNumbers: true } })
    })
    const items = changeItems(firstPage(version, now))
    expect(items.map(({ title, kind, details }) => [title, kind, details])).toEqual([
      ['Вход через OAuth', 'Диаграмма последовательности', ['название', 'нумерация']],
      ['Браузер', 'Участник', ['текст']],
      ['Запрос', 'Сообщение', ['участники', 'вид сообщения']],
    ])
  })
})
