import { HttpError } from '../api/http.ts'
import type { DeliveryError, NotificationEvent } from '../api/notificationSettings.ts'
import { relativeTime } from '../lib/relativeTime.ts'
import { notificationMessages as m } from './messages.ts'

/** The events in the words of the settings, with what each of them covers when the name does not say it. */
export const EVENT_LABELS: Record<NotificationEvent, { label: string; hint?: string }> = {
  get mentions() {
    return m.events.mentions
  },
  get replies() {
    return m.events.replies
  },
  get assignments() {
    return m.events.assignments
  },
  get access() {
    return m.events.access
  },
  get reviews() {
    return m.events.reviews
  },
}

export type ChannelKind = 'email' | 'webhook'

/** Why the last message of a channel did not go, and what the user may do about it. */
export function deliveryErrorText(kind: ChannelKind, error: DeliveryError): string {
  if (kind === 'email') {
    return error === 'rejected' ? m.delivery.emailRejected : m.delivery.emailUnavailable
  }
  return error === 'rejected' ? m.delivery.webhookRejected : m.delivery.webhookUnavailable
}

/** «5 минут назад», «только что». */
export function ago(time: string, now = Date.now()): string {
  return relativeTime(Date.parse(time), now)
}

/** What a failed change of the settings tells the user, by the `reason` of the answer. */
export function settingsErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return m.settingsErrors.offline
  switch (error.problem?.reason) {
    case 'invalid-address':
      return m.settingsErrors.invalidAddress
    case 'invalid-url':
      return m.settingsErrors.invalidUrl
    case 'host-not-allowed':
      return m.settingsErrors.hostNotAllowed
    case 'confirmation-limit':
      return m.settingsErrors.confirmationLimit
    case 'channel-unavailable':
      return m.settingsErrors.channelUnavailable
    case 'invalid-token':
      return m.settingsErrors.invalidToken
    case 'rejected':
      return deliveryErrorText('webhook', 'rejected')
    case 'unavailable':
      return deliveryErrorText('webhook', 'unavailable')
    default:
      return m.settingsErrors.failed
  }
}
