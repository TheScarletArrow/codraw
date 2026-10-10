import { describe, expect, it, vi } from 'vitest'
import type { Decision, DecisionContent } from '../api/decisions.ts'
import { HttpError } from '../api/http.ts'
import { setLocale } from '../i18n/i18n.ts'
import { importDecisions, reportText, type ImportReport } from './importDecisions.ts'

const decision = (id: string, number: number, changes: Partial<Decision> = {}): Decision => ({
  id,
  number,
  title: id,
  status: 'proposed',
  supersededBy: null,
  decidedOn: '2026-10-09',
  author: null,
  context: '',
  options: '',
  outcome: '',
  consequences: '',
  elements: [],
  createdAt: '2026-10-09T10:00:00Z',
  updatedAt: '2026-10-09T10:00:00Z',
  ...changes,
})

/** A board that numbers decisions as the backend does and refuses a number it has. */
function fakeBoard(existing: Decision[], limit = 500) {
  const decisions = [...existing]
  const addDecision = vi.fn(
    async (_boardId: string, request: Partial<DecisionContent> & { title: string; number?: number }) => {
      if (decisions.length >= limit) throw new HttpError(409, { limit })
      if (request.number !== undefined && decisions.some((other) => other.number === request.number)) {
        throw new HttpError(409, { number: request.number })
      }
      if ((request.context ?? '').length > 20) throw new HttpError(400)
      const number = request.number ?? Math.max(0, ...decisions.map((other) => other.number)) + 1
      const added = decision(`id-${number}`, number, { ...request, number })
      decisions.push(added)
      return added
    },
  )
  const updateDecision = vi.fn(async (_boardId: string, id: string, content: DecisionContent) => {
    const index = decisions.findIndex((other) => other.id === id)
    decisions[index] = { ...decisions[index]!, ...content }
    return decisions[index]!
  })
  return { decisions, api: { addDecision, updateDecision } }
}

const record = (name: string, text: string) => ({ name, text })

describe('importDecisions', () => {
  it('adds numbered records in the order of their numbers, then the others, and links superseded ones', async () => {
    const board = fakeBoard([decision('existing', 1)])
    const files = [
      record('docs/adr/0004-pulsar.md', '---\nstatus: accepted\ndate: 2026-01-04\n---\n# Pulsar'),
      record('docs/adr/notes.md', '# Без номера'),
      record('docs/adr/0003-kafka.md', '---\nstatus: "superseded by [ADR-0004](0004-pulsar.md)"\n---\n# Kafka'),
      record('docs/adr/0002-old.md', '# Old\n\n* Status: superseded by ADR-0001'),
    ]

    const report = await importDecisions('board', files, board.decisions.slice(0, 1), board.api)

    expect(board.api.addDecision.mock.calls.map(([, request]) => request)).toEqual([
      { title: 'Old', status: 'superseded', context: '', options: '', outcome: '', consequences: '', number: 2 },
      { title: 'Kafka', status: 'superseded', context: '', options: '', outcome: '', consequences: '', number: 3 },
      {
        title: 'Pulsar',
        status: 'accepted',
        decidedOn: '2026-01-04',
        context: '',
        options: '',
        outcome: '',
        consequences: '',
        number: 4,
      },
      { title: 'Без номера', status: 'proposed', context: '', options: '', outcome: '', consequences: '' },
    ])
    expect(report.added.map((added) => [added.number, added.title, added.supersededBy])).toEqual([
      [2, 'Old', 'existing'],
      [3, 'Kafka', 'id-4'],
      [4, 'Pulsar', null],
      [5, 'Без номера', null],
    ])
    expect(report).toMatchObject({ taken: [], untitled: [], failed: [], limit: null })
  })

  it('skips the numbers the board has, files without a title and files the board refuses', async () => {
    const board = fakeBoard([decision('existing', 1)])
    const files = [
      record('0001-kafka.md', '# Kafka'),
      record('0002-long.md', '# Long\n\n## Context\n\nA context much longer than the board takes.'),
      record('0003-empty.md', 'No title here'),
      record('0004-ok.md', '# Ok'),
    ]

    const report = await importDecisions('board', files, board.decisions.slice(0, 1), board.api)

    expect(report.added.map((added) => added.title)).toEqual(['Ok'])
    expect(report).toMatchObject({
      taken: ['0001-kafka.md'],
      untitled: ['0003-empty.md'],
      failed: ['0002-long.md'],
      limit: null,
    })
  })

  it('stops at the limit of the board and names the files left', async () => {
    const board = fakeBoard([decision('existing', 1)], 2)
    const files = [record('0002-a.md', '# A'), record('0003-b.md', '# B'), record('0004-c.md', '# C')]

    const report = await importDecisions('board', files, board.decisions.slice(0, 1), board.api)

    expect(report.added.map((added) => added.title)).toEqual(['A'])
    expect(report).toMatchObject({ failed: ['0003-b.md', '0004-c.md'], limit: 2 })
    expect(board.api.addDecision).toHaveBeenCalledTimes(2)
  })
})

describe('reportText', () => {
  const report = (changes: Partial<ImportReport>): ImportReport => ({
    added: [],
    taken: [],
    untitled: [],
    failed: [],
    limit: null,
    ...changes,
  })

  it('says what was imported and what was not', () => {
    expect(reportText(report({ added: [decision('a', 1), decision('b', 2)] }))).toBe('Импортировано: 2.')
    expect(reportText(report({ taken: ['0001-a.md', '0002-b.md'], untitled: ['x.md'], failed: ['y.md'] }))).toBe(
      'Импортировано: 0. Номер уже занят: 0001-a.md, 0002-b.md. Без заголовка: x.md. Не удалось: y.md.',
    )
    expect(reportText(report({ failed: ['y.md'], limit: 500 }))).toBe(
      'Импортировано: 0. На доске уже 500 решений — больше нельзя.',
    )
  })

  it('speaks English with the English interface', () => {
    setLocale('en')
    expect(reportText(report({ added: [decision('a', 1)], untitled: ['x.md'] }))).toBe('Imported: 1. No title: x.md.')
    expect(reportText(report({ limit: 1 }))).toBe('Imported: 0. The board already has 1 decision: no more can be added.')
  })
})
