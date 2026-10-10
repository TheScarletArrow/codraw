import { locale } from '../i18n/i18n.ts'
import { LegalPage } from './LegalPage.tsx'
import { legalMessages as m } from './messages.ts'
import { PrivacyEn } from './PrivacyPage.en.tsx'
import { PrivacyRu } from './PrivacyPage.ru.tsx'

/** The day the policy was last changed. */
const PRIVACY_UPDATED = '2026-10-10'

/**
 * What CoDraw does with personal data, as it really does it, in the language of the interface; the settings of the
 * installation come from the backend.
 */
export function PrivacyPage() {
  return (
    <LegalPage title={m.privacy} updated={PRIVACY_UPDATED} other={{ to: '/terms', title: m.terms }}>
      {(legal) => (locale() === 'en' ? <PrivacyEn legal={legal} /> : <PrivacyRu legal={legal} />)}
    </LegalPage>
  )
}
