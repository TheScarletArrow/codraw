import { locale } from '../i18n/i18n.ts'
import { LegalPage } from './LegalPage.tsx'
import { legalMessages as m } from './messages.ts'
import { TermsEn } from './TermsPage.en.tsx'
import { TermsRu } from './TermsPage.ru.tsx'

/** The day the terms were last changed. */
const TERMS_UPDATED = '2026-10-09'

/** The rules of using this installation of CoDraw, in the language of the interface. */
export function TermsPage() {
  return (
    <LegalPage title={m.terms} updated={TERMS_UPDATED} other={{ to: '/privacy', title: m.privacy }}>
      {(legal) => (locale() === 'en' ? <TermsEn legal={legal} /> : <TermsRu legal={legal} />)}
    </LegalPage>
  )
}
