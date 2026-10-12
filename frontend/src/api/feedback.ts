import { request } from './http.ts'

/** What a user tells the administrators of the installation about. */
export type FeedbackKind = 'bug' | 'idea' | 'other'

/** The kinds of feedback in the order the form offers them. */
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ['bug', 'idea', 'other']

/** The longest text of feedback, as the backend takes it. */
export const FEEDBACK_TEXT_MAX_LENGTH = 4000

/** What the app sends; the backend takes the browser from the headers of the request. */
export interface FeedbackDraft {
  kind: FeedbackKind
  text: string
  /** The path of the page, without its query. */
  page: string
  appVersion: string
}

/** Sends feedback to the administrators; 429 when this address or this user sent too much of it. */
export function sendFeedback(draft: FeedbackDraft): Promise<void> {
  return request('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
}

/** Feedback as the administrators see it. */
export interface Feedback {
  id: string
  /** Who sent it; `null` once their account is deleted. */
  author: { id: string; name: string; guest: boolean } | null
  kind: FeedbackKind
  text: string
  page: string | null
  appVersion: string | null
  /** The `User-Agent` of the browser it came from. */
  userAgent: string | null
  createdAt: string
  resolvedAt: string | null
  /** The name of the administrator who closed it. */
  resolvedBy: string | null
}

/** Open feedback, the newest first, or the latest closed. */
export const fetchFeedback = (status: 'open' | 'resolved'): Promise<Feedback[]> => request(`/api/admin/feedback?status=${status}`)

export const resolveFeedback = (id: string): Promise<Feedback> => request(`/api/admin/feedback/${id}/resolve`, { method: 'POST' })
