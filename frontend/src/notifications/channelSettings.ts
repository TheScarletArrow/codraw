import { HttpError } from '../api/http.ts'
import type { DeliveryError, NotificationEvent } from '../api/notificationSettings.ts'
import { relativeTime } from '../lib/relativeTime.ts'

/** The events in the words of the settings, with what each of them covers when the name does not say it. */
export const EVENT_LABELS: Record<NotificationEvent, { label: string; hint?: string }> = {
  mentions: { label: 'Упоминания' },
  replies: { label: 'Ответы в ветках' },
  assignments: { label: 'Назначенные ветки' },
  access: { label: 'Доступ к доскам', hint: 'запросы доступа, ответы на ваши запросы, передача владения' },
  reviews: { label: 'Ревью', hint: 'запросы ревью и предложения изменений' },
}

export type ChannelKind = 'email' | 'webhook'

/** Why the last message of a channel did not go, and what the user may do about it. */
export function deliveryErrorText(kind: ChannelKind, error: DeliveryError): string {
  if (kind === 'email') {
    return error === 'rejected'
      ? 'Почтовый сервер не принял адрес — проверьте его'
      : 'Почтовый сервер недоступен — CoDraw повторит попытку'
  }
  return error === 'rejected'
    ? 'Сервис чата отклонил сообщение — проверьте адрес вебхука'
    : 'Сервис чата недоступен — CoDraw повторит попытку'
}

/** «5 минут назад», «только что». */
export function ago(time: string, now = Date.now()): string {
  return relativeTime(Date.parse(time), now)
}

/** What a failed change of the settings tells the user, by the `reason` of the answer. */
export function settingsErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return 'Не удалось сохранить — проверьте соединение'
  switch (error.problem?.reason) {
    case 'invalid-address':
      return 'Это не похоже на адрес почты'
    case 'invalid-url':
      return 'Нужен адрес входящего вебхука, который начинается с https://'
    case 'host-not-allowed':
      return 'Этот сервис чата не разрешён на сервере CoDraw'
    case 'confirmation-limit':
      return 'Слишком много писем подтверждения — попробуйте через час'
    case 'channel-unavailable':
      return 'Этот канал на сервере больше не настроен'
    case 'invalid-token':
      return 'Ссылка не подходит: она устарела, уже использована или пришла на адрес другого пользователя'
    case 'rejected':
      return deliveryErrorText('webhook', 'rejected')
    case 'unavailable':
      return deliveryErrorText('webhook', 'unavailable')
    default:
      return 'Не удалось сохранить'
  }
}
