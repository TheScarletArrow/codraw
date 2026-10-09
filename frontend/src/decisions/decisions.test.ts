import { describe, expect, it } from 'vitest'
import type { Decision } from '../api/decisions.ts'
import type { StatusItem } from '../board/statusList.ts'
import {
  countByStatus,
  decisionCode,
  decisionsByCell,
  filterDecisions,
  formatDay,
  reviewSuggestions,
  statusText,
  today,
  withElements,
} from './decisions.ts'

const decision = (id: string, changes: Partial<Decision> = {}): Decision => ({
  id,
  number: 1,
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

const kafka = decision('kafka', {
  number: 8,
  status: 'accepted',
  elements: [
    { pageId: 'page-1', cellId: 'queue' },
    { pageId: 'page-2', cellId: 'queue-2' },
  ],
})
const rabbit = decision('rabbit', {
  number: 3,
  status: 'superseded',
  supersededBy: 'kafka',
  elements: [{ pageId: 'page-1', cellId: 'queue' }],
})
const cache = decision('cache', { number: 9, elements: [{ pageId: 'page-1', cellId: 'redis' }] })
const all = [rabbit, kafka, cache]

describe('decisions', () => {
  it('names a decision by its number as its file does', () => {
    expect(decisionCode(8)).toBe('ADR-0008')
    expect(decisionCode(12345)).toBe('ADR-12345')
  })

  it('says which decision superseded a decision while the board has it', () => {
    expect(statusText(rabbit, all)).toBe('Заменено решением ADR-0008')
    expect(statusText(rabbit, [rabbit])).toBe('Заменено')
    expect(statusText(kafka, all)).toBe('Принято')
  })

  it('filters decisions by status and to those of an element', () => {
    expect(filterDecisions(all, 'all', null)).toEqual(all)
    expect(filterDecisions(all, 'proposed', null)).toEqual([cache])
    expect(filterDecisions(all, 'all', { pageId: 'page-1', cellId: 'queue' })).toEqual([rabbit, kafka])
    expect(filterDecisions(all, 'accepted', { pageId: 'page-1', cellId: 'queue' })).toEqual([kafka])
    expect(filterDecisions(all, 'all', { pageId: 'page-2', cellId: 'queue' })).toEqual([])
    // One decision in focus shows among all of them.
    expect(filterDecisions(all, 'all', { decisionId: 'kafka' })).toEqual(all)
  })

  it('counts decisions by status and by element of a page', () => {
    expect(countByStatus(all)).toEqual({ proposed: 1, accepted: 1, rejected: 0, superseded: 1 })
    expect(decisionsByCell(all, 'page-1')).toEqual(
      new Map([
        ['queue', 2],
        ['redis', 1],
      ]),
    )
    expect(decisionsByCell(all, 'page-2')).toEqual(new Map([['queue-2', 1]]))
  })

  it('adds elements once each, in their order', () => {
    expect(
      withElements(kafka.elements, [
        { pageId: 'page-1', cellId: 'queue' },
        { pageId: 'page-1', cellId: 'api' },
        { pageId: 'page-1', cellId: 'api' },
      ]),
    ).toEqual([...kafka.elements, { pageId: 'page-1', cellId: 'api' }])
  })

  it('offers a proposal the elements waiting for a review that it is not about', () => {
    const item = (cellId: string, status: StatusItem['status']): StatusItem => ({
      pageId: 'page-1',
      pageName: 'Обзор',
      cellId,
      title: cellId,
      status,
      by: null,
      name: null,
      at: null,
    })
    const statuses = [item('redis', 'review'), item('api', 'review'), item('db', 'draft')]

    expect(reviewSuggestions(cache, statuses)).toEqual([item('api', 'review')])
    expect(reviewSuggestions(kafka, statuses)).toEqual([])
  })

  it('writes days as the list shows them and today as the form takes it', () => {
    expect(formatDay('2026-10-09')).toBe('9 окт. 2026 г.')
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
