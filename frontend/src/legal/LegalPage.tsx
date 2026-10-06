import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { fetchLegal, type LegalInfo } from '../api/legal.ts'

/** When the texts were last changed. */
export const LEGAL_UPDATED = '6 октября 2026 г.'

const pluralRules = new Intl.PluralRules('ru')

/** «1 день», «3 дня», «30 дней». */
export function days(count: number): string {
  const words: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'день', few: 'дня', many: 'дней', other: 'дня' }
  const word = words[pluralRules.select(count)] ?? 'дней'
  return `${count} ${word}`
}

/** A page of a legal text, open without a sign-in, with the operator of the installation and the other text. */
export function LegalPage({
  title,
  other,
  children,
}: {
  title: string
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
        <p className="mt-2 text-sm text-muted-foreground">Обновлено {LEGAL_UPDATED}</p>
        {legal.isPending && <p className="mt-6 text-muted-foreground">Загрузка…</p>}
        {legal.isError && (
          <p role="alert" className="mt-6 text-destructive">
            Не удалось загрузить данные оператора. Обновите страницу.
          </p>
        )}
        {legal.data && (
          <div className="mt-6 flex flex-col gap-6 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
            {children(legal.data)}
          </div>
        )}
        <nav aria-label="Документы" className="mt-10 flex flex-wrap gap-4 border-t pt-4 text-sm">
          <Link to={other.to} className="underline">
            {other.title}
          </Link>
          <Link to="/" className="underline">
            Вернуться в CoDraw
          </Link>
        </nav>
      </main>
    </div>
  )
}

/** The operator of the installation and where to write, or that the operator has not named themselves. */
export function Operator({ legal }: { legal: LegalInfo }) {
  if (!legal.operator && !legal.contactEmail) {
    return (
      <p>
        Оператор этой установки CoDraw не указал свои данные. Прежде чем пользоваться сервисом, узнайте, кто его
        предоставляет.
      </p>
    )
  }
  return (
    <p>
      Оператор сервиса — {legal.operator ?? 'не указан'}.{' '}
      {legal.contactEmail ? (
        <>
          Адрес для обращений: <a href={`mailto:${legal.contactEmail}`} className="underline">{legal.contactEmail}</a>.
        </>
      ) : (
        'Адрес для обращений оператор не указал.'
      )}
    </p>
  )
}
