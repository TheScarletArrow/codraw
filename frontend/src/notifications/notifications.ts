import type { NotificationKind, UserNotification } from '../api/notifications.ts'
import { perLocale } from '../i18n/i18n.ts'
import { notificationMessages as m } from './messages.ts'

/** Query keys of the notifications: all of them, the unread count, the pages of the list. */
export const notificationsKey = ['notifications'] as const
export const unreadCountKey = ['notifications', 'unread'] as const
export const notificationListKey = ['notifications', 'list'] as const

/** How often the header asks for the unread count, and the open list for its pages, in milliseconds. */
export const NOTIFICATIONS_POLL_INTERVAL = 30_000

/**
 * A notification in words: who, what on which board, and a line more. The words do not depend on the gender of the
 * actor: «Аня: упоминание в «Схема БД»», not «Аня упомянула», and «Аня: вам назначена ветка в «Схема БД»», not «Аня
 * назначила».
 */
export interface NotificationText {
  /** `null` for a notification about a board the user can no longer open. */
  actor: string | null
  action: string
  /** The start of the comment, or what the notification means for the user. */
  detail: string | null
}

/**
 * Says what a notification tells. A kind this page does not know, e.g. one added by a later version of the backend while
 * the tab stayed open, is told in general words rather than breaking the list.
 */
export function describeNotification(notification: UserNotification): NotificationText {
  const label = (m.kinds as Partial<Record<NotificationKind, string>>)[notification.kind] ?? m.notification
  if (!notification.access) return { actor: null, action: label, detail: m.boardUnavailable }
  const actor = notification.actor?.name ?? m.deletedUser
  const board = notification.boardTitle ?? ''
  const editing = notification.role === 'editor'
  switch (notification.kind) {
    case 'mention':
      return { actor, action: m.mention(board), detail: notification.snippet }
    case 'reply':
      return { actor, action: m.reply(board), detail: notification.snippet }
    case 'assigned':
      return { actor, action: m.assigned(board), detail: notification.snippet }
    case 'access-request':
      return { actor, action: m.accessRequest(board), detail: editing ? m.asksEdit : m.asksView }
    case 'access-granted':
      return { actor, action: m.accessGranted(board), detail: editing ? m.canEdit : m.canView }
    case 'access-declined':
      return { actor, action: m.accessDeclined(board), detail: editing ? m.askedEdit : m.askedView }
    case 'ownership':
      return { actor, action: m.ownership(board), detail: m.nowOwner }
    case 'proposal-created':
      return { actor, action: m.proposalCreated(board), detail: notification.snippet }
    case 'proposal-accepted':
      return { actor, action: m.proposalAccepted(board), detail: notification.snippet }
    case 'proposal-declined':
      return { actor, action: m.proposalDeclined(board), detail: notification.snippet }
    case 'review-request':
      return { actor, action: m.reviewRequest(board), detail: m.markedForReview }
    default:
      return { actor, action: m.event(board), detail: notification.snippet }
  }
}

/** The first line of a notification as one string: «Аня: упоминание в «Схема БД»». */
export function notificationTitle({ actor, action }: NotificationText): string {
  return actor ? `${actor}: ${action}` : action
}

/** The kinds of notifications about a thread, which lead to it. */
const THREAD_KINDS = new Set<NotificationKind>(['mention', 'reply', 'assigned'])

/**
 * Where a notification leads: a mention, an answer or an assigned thread to the thread on its page, a request for
 * access to «Поделиться» with the requests, a proposal of changes to its review on the board, a request for a review to
 * the element on its page, anything else and a board the user can no longer open to the board.
 */
export function notificationLink(notification: UserNotification): string {
  const board = `/boards/${encodeURIComponent(notification.boardId)}`
  if (!notification.access) return board
  if (THREAD_KINDS.has(notification.kind) && notification.threadId) {
    const params = new URLSearchParams()
    if (notification.pageId) params.set('page', notification.pageId)
    params.set('thread', notification.threadId)
    return `${board}?${params}`
  }
  if (notification.kind === 'access-request') return `${board}?share=requests`
  if (notification.kind === 'review-request' && notification.pageId && notification.cellId) {
    return `${board}?${new URLSearchParams({ page: notification.pageId, cell: notification.cellId })}`
  }
  if (notification.proposalId) return `${board}?proposal=${encodeURIComponent(notification.proposalId)}`
  return board
}

const relativeFormat = perLocale((tag) => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }))
const dateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium' }))

/**
 * How long ago, in the language of the interface: «только что», «5 минут назад», «3 часа назад», «вчера», and the date
 * after a week.
 */
export function timeAgo(time: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(time)) / 60_000)
  if (minutes < 1) return m.justNow
  if (minutes < 60) return relativeFormat().format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return relativeFormat().format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 7) return relativeFormat().format(-days, 'day')
  return dateFormat().format(new Date(time))
}
