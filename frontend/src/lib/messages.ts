import { defineMessages, pluralEn, pluralRu } from '../i18n/i18n.ts'

export const libMessages = defineMessages({
  ru: {
    untitledFile: 'Доска',
    justNow: 'только что',
    minutesAgo: (n: number) => `${n} ${pluralRu(n, 'минуту', 'минуты', 'минут')} назад`,
    hoursAgo: (n: number) => `${n} ${pluralRu(n, 'час', 'часа', 'часов')} назад`,
    daysAgo: (n: number) => `${n} ${pluralRu(n, 'день', 'дня', 'дней')} назад`,
    monthsAgo: (n: number) => `${n} ${pluralRu(n, 'месяц', 'месяца', 'месяцев')} назад`,
    yearsAgo: (n: number) => `${n} ${pluralRu(n, 'год', 'года', 'лет')} назад`,
  },
  en: {
    untitledFile: 'Board',
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} ${pluralEn(n, 'minute', 'minutes')} ago`,
    hoursAgo: (n: number) => `${n} ${pluralEn(n, 'hour', 'hours')} ago`,
    daysAgo: (n: number) => `${n} ${pluralEn(n, 'day', 'days')} ago`,
    monthsAgo: (n: number) => `${n} ${pluralEn(n, 'month', 'months')} ago`,
    yearsAgo: (n: number) => `${n} ${pluralEn(n, 'year', 'years')} ago`,
  },
})
