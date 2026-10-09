import type { IssueLink } from '../api/issues.ts'

/** A link of an issue to the element `api` of `page-1`, as the API returns it, with the [overrides]. */
export const issueLink = (overrides: Partial<IssueLink> = {}): IssueLink => ({
  id: 'link-1',
  pageId: 'page-1',
  cellId: 'api',
  threadId: null,
  tracker: 'github',
  repository: 'acme/shop',
  number: 12,
  title: 'Кэш для каталога',
  state: 'open',
  stateReason: null,
  url: 'https://github.com/acme/shop/issues/12',
  private: false,
  sync: 'ok',
  syncedAt: '2026-10-09T10:00:00Z',
  linkedBy: { id: 'alice', name: 'Алиса', avatarUrl: null },
  createdHere: false,
  createdAt: '2026-10-09T10:00:00Z',
  ...overrides,
})
