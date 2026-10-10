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

/** «GitHub», «GitHub или Google», «A, B или C» of the providers of the installation; empty for none. */
function providerNames(legal: LegalInfo, corporate: boolean, conjunction = 'или'): string {
  const names = legal.signInProviders.filter((provider) => provider.corporate === corporate).map((provider) => provider.name)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1)}` : (names[0] ?? '')
}

/** What GitHub and Google give CoDraw, when the installation signs in through them. */
function publicAccount(legal: LegalInfo): string {
  const names = providerNames(legal, false)
  return names
    ? `При входе через ${names} — имя, адрес картинки профиля и идентификатор пользователя у этого сервиса. Адрес электронной почты CoDraw у них не запрашивает, пароль от ${names} не получает. `
    : ''
}

/** What the provider that the operator chose gives CoDraw, and what of it CoDraw keeps. */
function corporateAccount(legal: LegalInfo): string {
  const names = providerNames(legal, true)
  return names
    ? `При входе через ${names} — провайдера входа, которого выбрал оператор установки, — CoDraw получает от провайдера идентификатор пользователя, имя, адрес картинки профиля, адрес электронной почты и группы. Хранятся идентификатор вместе с адресом провайдера, имя и адрес картинки; почту и группы CoDraw только сверяет при входе с ограничениями, которые задал оператор, и не хранит. Пароль от учётной записи провайдера CoDraw не получает.`
    : ''
}

/** Who learns of signing in. */
function signInRecipients(legal: LegalInfo): string {
  const names = providerNames(legal, false, 'и')
  const corporate = providerNames(legal, true)
  return (
    (names ? `${names} узнают о входе через них по своим правилам. ` : '') +
    (corporate
      ? `Провайдер входа, которого выбрал оператор, — ${corporate} — узнаёт о входе и выходе через него по правилам оператора. `
      : '')
  )
}
