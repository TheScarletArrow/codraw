const pluralRules = new Intl.PluralRules('ru')

type Forms = Record<'one' | 'few' | 'many', string>

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Forms of a unit after a number in «… назад»: «1 минуту», «2 минуты», «5 минут». */
const MINUTES: Forms = { one: 'минуту', few: 'минуты', many: 'минут' }
const HOURS: Forms = { one: 'час', few: 'часа', many: 'часов' }
const DAYS: Forms = { one: 'день', few: 'дня', many: 'дней' }
const MONTHS: Forms = { one: 'месяц', few: 'месяца', many: 'месяцев' }
const YEARS: Forms = { one: 'год', few: 'года', many: 'лет' }

/** «21 минуту назад», «3 часа назад», «11 месяцев назад». */
function ago(count: number, forms: Forms): string {
  const rule = pluralRules.select(count)
  return `${count} ${rule === 'one' || rule === 'few' ? forms[rule] : forms.many} назад`
}

/**
 * How long ago `time` was at `now`, both in milliseconds since the epoch, as Russian speaks of it: «только что»
 * within a minute, then whole minutes, hours, days, months of 30 days and years of 365 days. A time ahead of `now`,
 * e.g. from the clock of another computer, is «только что» too.
 */
export function relativeTime(time: number, now: number): string {
  const elapsed = now - time
  if (elapsed < MINUTE) return 'только что'
  if (elapsed < HOUR) return ago(Math.floor(elapsed / MINUTE), MINUTES)
  if (elapsed < DAY) return ago(Math.floor(elapsed / HOUR), HOURS)
  const days = Math.floor(elapsed / DAY)
  if (days < 30) return ago(days, DAYS)
  const months = Math.floor(days / 30)
  if (months < 12) return ago(months, MONTHS)
  return ago(Math.max(1, Math.floor(days / 365)), YEARS)
}
