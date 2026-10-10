import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { fetchLegal, type LegalInfo } from '../api/legal.ts'
import { perLocale } from '../i18n/i18n.ts'
import { legalMessages as m } from './messages.ts'

const dayFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }))

/** `9 октября 2026 г.` or `October 9, 2026` for `2026-10-09`. */
function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return dayFormat().format(new Date(year, month - 1, day))
}

/**
 * A page of a legal text, open without a sign-in, with the operator of the installation and the other text. `updated` is
 * the day the text was last changed, `YYYY-MM-DD`.
 */
export function LegalPage({
  title,
  updated,
  other,
  children,
}: {
  title: string
  updated: string
  other: { to: string; title: string }
  children: (legal: LegalInfo) => ReactNode
}) {
  const legal = useQuery({ queryKey: ['legal'], queryFn: fetchLegal })

  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center border-b px-4">
        <Link to="/" className="font-bold">
          CoDraw
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{m.updated(formatDay(updated))}</p>
        {legal.isPending && <p className="mt-6 text-muted-foreground">{m.loading}</p>}
        {legal.isError && (
          <p role="alert" className="mt-6 text-destructive">
            {m.loadFailed}
          </p>
        )}
        {legal.data && (
          <div className="mt-6 flex flex-col gap-6 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
            {children(legal.data)}
          </div>
        )}
        <nav aria-label={m.documents} className="mt-10 flex flex-wrap gap-4 border-t pt-4 text-sm">
          <Link to={other.to} className="underline">
            {other.title}
          </Link>
          <Link to="/" className="underline">
            {m.backToApp}
          </Link>
        </nav>
      </main>
    </div>
  )
}

/** The operator of the installation and where to write, or that the operator has not named themselves. */
export function Operator({ legal }: { legal: LegalInfo }) {
  if (!legal.operator && !legal.contactEmail) {
    return <p>{m.operatorUnknown}</p>
  }
  return (
    <p>
      {m.operator(legal.operator ?? m.operatorNotNamed)}{' '}
      {legal.contactEmail ? (
        <>
          {m.contact} <a href={`mailto:${legal.contactEmail}`} className="underline">{legal.contactEmail}</a>.
        </>
      ) : (
        m.noContact
      )}
    </p>
  )
}
