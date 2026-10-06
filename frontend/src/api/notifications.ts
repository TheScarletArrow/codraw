import { request } from './http.ts'
import type { MemberRole } from './members.ts'

/** What a notification tells its recipient. */
export type NotificationKind =
  | 'mention'
  | 'reply'
  | 'assigned'
  | 'access-request'
  | 'access-granted'
  | 'access-declined'
  | 'ownership'
  | 'proposal-created'
  | 'proposal-accepted'
  | 'proposal-declined'

/** The user who did what a notification tells. */
export interface NotificationActor {
  id: string
  name: string
  avatarUrl: string | null
}

/**
 * A notification as its recipient sees it. Without a role on the board now (`access` is `false`) it names neither the
 * board nor the comment nor the proposal nor who did it.
 */
export interface UserNotification {
  id: string
  kind: NotificationKind
  boardId: string
  /** Whether the recipient may open the board now. */
  access: boolean
  boardTitle: string | null
  /** The page of the thread of a mention, an answer or an assignment. */
  pageId: string | null
  threadId: string | null
  commentId: string | null
  /** The proposal of changes that a notification about one is about. */
  proposalId: string | null
  /**
   * The start of the comment of a mention or an answer, of the first comment of an assigned thread, or of the title of a
   * proposal.
   */
  snippet: string | null
  /** `null` without access and once the actor is deleted. */
  actor: NotificationActor | null
  /** The role asked for, given or declined. */
  role: MemberRole | null
  createdAt: string
  /** When the recipient read it, `null` while they did not. */
  readAt: string | null
}

/** A page of notifications, newest first, and the cursor of the next page, `null` after the last one. */
export interface NotificationPage {
  notifications: UserNotification[]
  next: string | null
}

/** A page of the notifications of the current user, newest first; `before` is the `next` of the previous page. */
export function fetchNotifications(before: string | null = null): Promise<NotificationPage> {
  return request(before ? `/api/notifications?before=${encodeURIComponent(before)}` : '/api/notifications')
}

/** How many notifications the current user has not read. */
export async function fetchUnreadCount(): Promise<number> {
  return (await request<{ count: number }>('/api/notifications/unread-count')).count
}

/** Marks the notification read; repeating it changes nothing. */
export function markNotificationRead(id: string): Promise<void> {
  return request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

/** Marks all notifications of the current user read, those on pages not loaded too. */
export function markAllNotificationsRead(): Promise<void> {
  return request('/api/notifications/read-all', { method: 'POST' })
}
