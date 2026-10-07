import { describe, expect, it } from 'vitest'
import type { UserNotification } from '../api/notifications.ts'
import { describeNotification, notificationLink, notificationTitle, timeAgo } from './notifications.ts'

const boardId = '0199a000-0000-7000-8000-000000000001'

function notification(changes: Partial<UserNotification> = {}): UserNotification {
  return {
    id: 'n-1',
    kind: 'mention',
    boardId,
    access: true,
    boardTitle: 'Схема БД',
    pageId: 'page-2',
    cellId: null,
    threadId: 'thread-1',
    commentId: 'comment-1',
    proposalId: null,
    snippet: '@Боб посмотри',
    actor: { id: 'anya', name: 'Аня', avatarUrl: null },
    role: null,
    createdAt: '2026-10-06T10:00:00Z',
    readAt: null,
    ...changes,
  }
}

const access = { pageId: null, threadId: null, commentId: null, snippet: null }

const proposal = { ...access, proposalId: 'proposal-1', snippet: 'Добавить очередь' }

const review = { ...access, pageId: 'page-2', cellId: 'orders' }

describe('notifications', () => {
  it('says who did what on which board, whatever their gender', () => {
    const cases: [Partial<UserNotification>, string, string | null][] = [
      [{}, 'Аня: упоминание в «Схема БД»', '@Боб посмотри'],
      [{ kind: 'reply', snippet: 'Согласна' }, 'Аня: ответ в ветке на «Схема БД»', 'Согласна'],
      [{ kind: 'assigned', commentId: null, snippet: 'Поправь связь' }, 'Аня: вам назначена ветка в «Схема БД»', 'Поправь связь'],
      [{ kind: 'access-request', role: 'editor', ...access }, 'Аня: запрос доступа к «Схема БД»', 'Просит редактирование'],
      [{ kind: 'access-request', role: 'viewer', ...access }, 'Аня: запрос доступа к «Схема БД»', 'Просит просмотр'],
      [{ kind: 'access-granted', role: 'editor', ...access }, 'Аня: доступ к «Схема БД»', 'Теперь можно редактировать'],
      [{ kind: 'access-granted', role: 'viewer', ...access }, 'Аня: доступ к «Схема БД»', 'Теперь можно смотреть'],
      [{ kind: 'access-declined', role: 'editor', ...access }, 'Аня: отказ в доступе к «Схема БД»', 'Вы просили редактирование'],
      [{ kind: 'ownership', ...access }, 'Аня: передача владения «Схема БД»', 'Теперь вы владелец доски'],
      [{ kind: 'proposal-created', ...proposal }, 'Аня: предложение изменений к «Схема БД»', 'Добавить очередь'],
      [{ kind: 'proposal-accepted', ...proposal }, 'Аня: ваше предложение к «Схема БД» принято', 'Добавить очередь'],
      [{ kind: 'proposal-declined', ...proposal }, 'Аня: ваше предложение к «Схема БД» отклонено', 'Добавить очередь'],
      [{ kind: 'review-request', ...review }, 'Аня: запрос ревью на «Схема БД»', 'Элемент отмечен «Нужно ревью»'],
    ]
    for (const [changes, title, detail] of cases) {
      const text = describeNotification(notification(changes))
      expect(notificationTitle(text)).toBe(title)
      expect(text.detail).toBe(detail)
    }
  })

  it('names an actor who is gone as a deleted user', () => {
    expect(notificationTitle(describeNotification(notification({ actor: null })))).toBe(
      'Удалённый пользователь: упоминание в «Схема БД»',
    )
  })

  it('tells only what happened about a board the user can no longer open', () => {
    const closed = { access: false, boardTitle: null, actor: null, role: null, ...access }

    expect(describeNotification(notification(closed))).toEqual({ actor: null, action: 'Упоминание', detail: 'Доска недоступна' })
    expect(notificationTitle(describeNotification(notification({ ...closed, kind: 'access-declined' })))).toBe(
      'Отказ в доступе',
    )
    expect(notificationTitle(describeNotification(notification({ ...closed, kind: 'assigned' })))).toBe('Назначение ветки')
    expect(notificationTitle(describeNotification(notification({ ...closed, kind: 'proposal-accepted' })))).toBe(
      'Предложение принято',
    )
    expect(notificationTitle(describeNotification(notification({ ...closed, kind: 'review-request' })))).toBe('Запрос ревью')
  })

  it('tells a kind it does not know in general words and leads to the board', () => {
    const unknown = notification({ kind: 'from-a-newer-backend' as UserNotification['kind'], ...access })
    expect(notificationTitle(describeNotification(unknown))).toBe('Аня: событие на «Схема БД»')
    expect(describeNotification({ ...unknown, access: false }).action).toBe('Уведомление')
    expect(notificationLink(unknown)).toBe(`/boards/${boardId}`)
  })

  it('leads to the thread of a mention, an answer or an assignment on its page, to the requests for access, to the proposal, to the element to review, or to the board', () => {
    expect(notificationLink(notification())).toBe(`/boards/${boardId}?page=page-2&thread=thread-1`)
    expect(notificationLink(notification({ kind: 'reply', pageId: 'страница 1' }))).toBe(
      `/boards/${boardId}?page=%D1%81%D1%82%D1%80%D0%B0%D0%BD%D0%B8%D1%86%D0%B0+1&thread=thread-1`,
    )
    expect(notificationLink(notification({ kind: 'assigned', commentId: null }))).toBe(
      `/boards/${boardId}?page=page-2&thread=thread-1`,
    )
    expect(notificationLink(notification({ kind: 'access-request', role: 'editor', ...access }))).toBe(
      `/boards/${boardId}?share=requests`,
    )
    expect(notificationLink(notification({ kind: 'access-granted', role: 'editor', ...access }))).toBe(`/boards/${boardId}`)
    expect(notificationLink(notification({ kind: 'ownership', ...access }))).toBe(`/boards/${boardId}`)
    expect(notificationLink(notification({ kind: 'proposal-created', ...proposal }))).toBe(
      `/boards/${boardId}?proposal=proposal-1`,
    )
    expect(notificationLink(notification({ kind: 'proposal-declined', access: false, ...access }))).toBe(`/boards/${boardId}`)
    expect(notificationLink(notification({ kind: 'review-request', ...review }))).toBe(
      `/boards/${boardId}?page=page-2&cell=orders`,
    )
    expect(notificationLink(notification({ kind: 'review-request', access: false, ...access }))).toBe(`/boards/${boardId}`)
    expect(notificationLink(notification({ access: false, ...access }))).toBe(`/boards/${boardId}`)
  })

  it('tells how long ago in Russian', () => {
    const now = Date.parse('2026-10-06T12:00:00Z')
    const ago = (minutes: number) => timeAgo(new Date(now - minutes * 60_000).toISOString(), now)

    expect(ago(0)).toBe('только что')
    expect(ago(5)).toBe('5 минут назад')
    expect(ago(3 * 60)).toBe('3 часа назад')
    expect(ago(25 * 60)).toBe('вчера')
    expect(ago(4 * 24 * 60)).toBe('4 дня назад')
    expect(ago(10 * 24 * 60)).toBe('26 сент. 2026 г.')
  })
})
