import { request } from './http.ts'

/** What a user may choose to hear of outside of CoDraw: groups of kinds of notifications. */
export type NotificationEvent = 'mentions' | 'replies' | 'assignments' | 'access' | 'reviews'

/** All the events, in the order of the settings; a new channel gets them all. */
export const NOTIFICATION_EVENTS: NotificationEvent[] = ['mentions', 'replies', 'assignments', 'access', 'reviews']

/**
 * Why the last message did not go: `rejected` — the mail server or the chat refused it, which trying again does not
 * change; `unavailable` — no answer or an error of the server, CoDraw tries again.
 */
export type DeliveryError = 'rejected' | 'unavailable'

/** What every channel tells of itself. */
interface ChannelState {
  enabled: boolean
  events: NotificationEvent[]
  lastDeliveredAt: string | null
  lastError: DeliveryError | null
  lastErrorAt: string | null
}

export interface EmailChannel extends ChannelState {
  address: string
  /** Whether the owner of the address confirmed it; letters go only to a confirmed address. */
  verified: boolean
  /** When the letter with the link that confirms the address went, `null` when it did not go. */
  verificationSentAt: string | null
}

export interface WebhookChannel extends ChannelState {
  /** The host and the last characters of the address: the address itself is a secret the backend never returns. */
  addressHint: string
}

export interface MutedBoard {
  boardId: string
  /** `null` when the user can no longer open the board. */
  boardTitle: string | null
  mutedAt: string
}

export interface NotificationSettings {
  email: { available: boolean; channel: EmailChannel | null }
  /** `hosts` — the hosts of webhooks that the administrator allows. */
  webhook: { available: boolean; hosts: string[]; channel: WebhookChannel | null }
  mutedBoards: MutedBoard[]
}

export const NOTIFICATION_SETTINGS_QUERY_KEY = ['notification-settings'] as const

const PATH = '/api/notification-settings'

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** The channels of the user outside of CoDraw and the boards they muted; a guest gets 403. */
export function fetchNotificationSettings(): Promise<NotificationSettings> {
  return request(PATH)
}

export interface ChannelChanges {
  enabled: boolean
  events: NotificationEvent[]
}

/** Sets the email address and what goes to it; a new address gets a letter that confirms it. */
export function saveEmailChannel(address: string, changes: ChannelChanges): Promise<EmailChannel> {
  return request(`${PATH}/email`, { method: 'PUT', ...json({ address, ...changes }) })
}

/** Sends the letter that confirms the address again, with a new link. */
export function resendConfirmation(): Promise<EmailChannel> {
  return request(`${PATH}/email/resend`, { method: 'POST' })
}

/** Confirms the address with the token of the link of the letter. */
export function confirmEmail(token: string): Promise<void> {
  return request(`${PATH}/email/confirm`, { method: 'POST', ...json({ token }) })
}

/** Sets the webhook of a chat and what goes to it; without `url` the saved webhook stays. */
export function saveWebhookChannel(url: string | null, changes: ChannelChanges): Promise<WebhookChannel> {
  return request(`${PATH}/webhook`, { method: 'PUT', ...json({ url, ...changes }) })
}

/** Posts a test message to the webhook; fails with 502 and the `reason` when it did not go. */
export function testWebhook(): Promise<void> {
  return request(`${PATH}/webhook/test`, { method: 'POST' })
}

export function deleteChannel(kind: 'email' | 'webhook'): Promise<void> {
  return request(`${PATH}/${kind}`, { method: 'DELETE' })
}

/** Stops the notifications of the board from going to the channels of the user. */
export function muteBoard(boardId: string): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/notification-mute`, { method: 'PUT' })
}

/** Lets the notifications of the board go to the channels of the user again. */
export function unmuteBoard(boardId: string): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/notification-mute`, { method: 'DELETE' })
}
