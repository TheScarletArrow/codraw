import { defineMessages } from '../i18n/i18n.ts'

/** The texts of reports on boards. */
export const reportMessages = defineMessages({
  ru: {
    reasons: {
      spam: 'Спам или реклама',
      illegal: 'Незаконное содержимое',
      abuse: 'Оскорбления или травля',
      other: 'Другое',
    },
    report: 'Пожаловаться',
    reportBoard: 'Жалоба на доску',
    sent: 'Жалоба отправлена. Спасибо!',
    intro: 'Жалобу получат администраторы этой установки CoDraw. Ваш адрес с ней не сохраняется.',
    reason: 'Причина',
    message: 'Что не так',
    send: 'Отправить',
    tooMany: 'Слишком много жалоб с вашего адреса. Попробуйте позже.',
    failed: 'Не удалось отправить жалобу. Попробуйте ещё раз.',
  },
  en: {
    reasons: {
      spam: 'Spam or advertising',
      illegal: 'Illegal content',
      abuse: 'Insults or harassment',
      other: 'Other',
    },
    report: 'Report',
    reportBoard: 'Report the board',
    sent: 'The report is sent. Thank you!',
    intro: 'The administrators of this installation of CoDraw get the report. Your address is not stored with it.',
    reason: 'Reason',
    message: 'What is wrong',
    send: 'Send',
    tooMany: 'Too many reports from your address. Try again later.',
    failed: 'Could not send the report. Please try again.',
  },
})
