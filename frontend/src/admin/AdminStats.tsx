import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { adminKey } from '../api/admin.ts'
import { fetchStats, type ProductStats } from '../api/adminStats.ts'
import { isForbidden } from '../api/http.ts'
import { perLocale } from '../i18n/i18n.ts'
import { adminMessages } from '../pages/AdminPage.messages.ts'
import { adminStatsMessages as m } from './AdminStats.messages.ts'

const percent = perLocale((tag) => new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }))
// The days of the statistics are UTC days: they are shown as they are, whatever the time zone of the browser.
const dayFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' }))
const day = (date: string) => dayFormat().format(new Date(`${date}T00:00:00Z`))

/** The share of a part, or «нет данных» for a share of nothing. */
const share = (part: number, whole: number): string => (whole === 0 ? m.noData : percent().format(part / whole))

/**
 * «Статистика»: how many people use the installation, come back, sign in after trying it as guests, and edit boards
 * together. It shows numbers only, computed by the backend from days of activity; nothing of what people do is here.
 */
export function AdminStats() {
  const stats = useQuery({ queryKey: adminKey('stats'), queryFn: fetchStats })
  if (stats.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {isForbidden(stats.error) ? adminMessages.noAccess : adminMessages.loadFailed}
      </p>
    )
  }
  if (!stats.data) return <p className="text-sm text-muted-foreground">{adminMessages.loading}</p>
  return <Statistics stats={stats.data} />
}

function Statistics({ stats }: { stats: ProductStats }) {
  const { activeUsers, periods, cohorts } = stats
  const periodColumns = periods.map((period) => m.period(period.days))
  return (
    <div className="flex flex-col gap-6 text-sm">
      <div className="flex flex-col gap-1 text-muted-foreground">
        <p>{m.periods(day(stats.date))}</p>
        <p>{stats.collectedSince ? m.collectedSince(day(stats.collectedSince)) : m.notCollected}</p>
      </div>
      <Section title={m.activeUsers}>
        <StatsTable
          label={m.activeUsers}
          columns={activeUsers.map((users) => m.period(users.days))}
          rows={[
            { label: m.accounts, values: activeUsers.map((users) => users.accounts) },
            { label: m.guests, values: activeUsers.map((users) => users.guests) },
          ]}
        />
      </Section>
      <Section title={m.growth}>
        <StatsTable
          label={m.growth}
          columns={periodColumns}
          rows={[
            { label: m.newAccounts, values: periods.map((period) => period.newAccounts) },
            { label: m.guestConversions, values: periods.map((period) => period.guestConversions) },
          ]}
        />
      </Section>
      <Section title={m.retention} hint={m.retentionHint}>
        <StatsTable
          label={m.retention}
          columns={[m.cohortAccounts, m.cohortReturned, m.cohortShare]}
          rows={cohorts.map((cohort) => ({
            label: m.cohort(day(cohort.from), day(cohort.to)),
            values: [
              cohort.accounts,
              cohort.complete ? cohort.returned : m.noData,
              cohort.complete ? share(cohort.returned, cohort.accounts) : m.noData,
            ],
          }))}
        />
      </Section>
      <Section title={m.collaboration} hint={m.collaborationHint}>
        <StatsTable
          label={m.collaboration}
          columns={periodColumns}
          rows={[
            { label: m.editedBoards, values: periods.map((period) => period.editedBoards) },
            { label: m.coEditedBoards, values: periods.map((period) => period.coEditedBoards) },
            { label: m.coEditedShare, values: periods.map((period) => share(period.coEditedBoards, period.editedBoards)) },
          ]}
        />
      </Section>
      <p className="text-muted-foreground">{m.privacy}</p>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
      {hint && <p className="text-muted-foreground">{hint}</p>}
    </section>
  )
}

/** A table of numbers: a row per measure, a column per period or per part. */
function StatsTable({ label, columns, rows }: { label: string; columns: string[]; rows: { label: string; values: ReactNode[] }[] }) {
  return (
    <table className="w-full text-left" aria-label={label}>
      <thead className="text-muted-foreground">
        <tr>
          <td className="py-1" />
          {columns.map((column) => (
            <th key={column} scope="col" className="py-1 pl-2 text-right font-normal">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t">
            <th scope="row" className="py-1 pr-2 font-normal">
              {row.label}
            </th>
            {row.values.map((value, index) => (
              <td key={columns[index]} className="py-1 pl-2 text-right tabular-nums">
                {value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
