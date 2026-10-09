import { describe, expect, it } from 'vitest'
import { issueLink } from '../test/issueLinks.ts'
import { isOf, linksByCell, parseIssueReference, staleLinks, stateLabel, syncProblem } from './issues.ts'

describe('parseIssueReference', () => {
  it('reads the address of the page of an issue, owner/name#number, and a number in the repository at hand', () => {
    expect(parseIssueReference('https://github.com/acme/shop/issues/12', null)).toEqual({ repository: 'acme/shop', number: 12 })
    expect(parseIssueReference(' https://git.example.com/acme/shop/issues/7#issuecomment-1 ', null)).toEqual({
      repository: 'acme/shop',
      number: 7,
    })
    expect(parseIssueReference('acme/shop#3', 'other/repo')).toEqual({ repository: 'acme/shop', number: 3 })
    expect(parseIssueReference('#5', 'acme/shop')).toEqual({ repository: 'acme/shop', number: 5 })
    expect(parseIssueReference('5', 'acme/shop')).toEqual({ repository: 'acme/shop', number: 5 })
  })

  it('takes words, numbers without a repository and pull requests for no issue', () => {
    expect(parseIssueReference('кэш каталога', 'acme/shop')).toBeNull()
    expect(parseIssueReference('12', null)).toBeNull()
    expect(parseIssueReference('0', 'acme/shop')).toBeNull()
    expect(parseIssueReference('https://github.com/acme/shop/pull/12', null)).toBeNull()
    expect(parseIssueReference('acme#12', null)).toBeNull()
    expect(parseIssueReference('99999999999', 'acme/shop')).toBeNull()
  })
})

describe('links', () => {
  it('belong to an element of a page or to a thread', () => {
    const element = issueLink()
    const thread = issueLink({ id: 'link-2', pageId: null, cellId: null, threadId: 'thread-1' })
    expect(isOf(element, { pageId: 'page-1', cellId: 'api' })).toBe(true)
    expect(isOf(element, { pageId: 'page-2', cellId: 'api' })).toBe(false)
    expect(isOf(thread, { threadId: 'thread-1' })).toBe(true)
    expect(isOf(element, { threadId: 'thread-1' })).toBe(false)

    const byCell = linksByCell([element, thread, issueLink({ id: 'link-3', number: 13 }), issueLink({ id: 'link-4', pageId: 'page-2' })], 'page-1')
    expect([...byCell.keys()]).toEqual(['api'])
    expect(byCell.get('api')!.map((link) => link.id)).toEqual(['link-1', 'link-3'])
  })

  it('are asked about again after five minutes, unless deleted or kept up to date by nobody', () => {
    const now = new Date('2026-10-09T10:06:00Z').getTime()
    const links = [
      issueLink({ id: 'old' }),
      issueLink({ id: 'fresh', syncedAt: '2026-10-09T10:02:00Z' }),
      issueLink({ id: 'gone', sync: 'deleted' }),
      issueLink({ id: 'nobody', sync: 'disconnected' }),
      issueLink({ id: 'lost', sync: 'no-access' }),
    ]
    expect(staleLinks(links, now).map((link) => link.id)).toEqual(['old', 'lost'])
  })

  it('tell their state as GitHub does, and why they may be out of date', () => {
    expect(stateLabel({ state: 'open', stateReason: 'reopened' })).toBe('Открыта')
    expect(stateLabel({ state: 'closed', stateReason: 'completed' })).toBe('Закрыта: выполнена')
    expect(stateLabel({ state: 'closed', stateReason: null })).toBe('Закрыта: выполнена')
    expect(stateLabel({ state: 'closed', stateReason: 'not-planned' })).toBe('Закрыта: не планируется')
    expect(stateLabel({ state: 'closed', stateReason: 'duplicate' })).toBe('Закрыта: дубликат')

    expect(syncProblem(issueLink())).toBeNull()
    expect(syncProblem(issueLink({ sync: 'deleted' }))).toBe('Задача удалена в GitHub')
    expect(syncProblem(issueLink({ sync: 'disconnected' }))).toBe(
      'Не обновляется: у привязавшего задачу участника (Алиса) нет рабочего подключения к GitHub',
    )
    expect(syncProblem(issueLink({ sync: 'disconnected', linkedBy: null }))).toBe(
      'Не обновляется: привязавший задачу участник удалён',
    )
    expect(syncProblem(issueLink({ sync: 'no-access' }))).toBe(
      'Нет доступа: задачу удалили или перенесли, либо подключение привязавшего её участника (Алиса) больше её не видит',
    )
  })
})
