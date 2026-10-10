import type { ReactNode } from 'react'
import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the login page. */
export const loginMessages = defineMessages({
  ru: {
    intro: 'Войдите, чтобы работать со своими досками.',
    failed: 'Вход не выполнен. Попробуйте ещё раз.',
    signInWith: (provider: string) => `Войти через ${provider}`,
    accountDeleted: 'Учётная запись удалена. Новый вход создаст новую пустую учётную запись.',
    denied: 'Вход в эту установку CoDraw вам не разрешён. Обратитесь к администратору.',
    notConfigured: 'Вход не настроен. Обратитесь к администратору.',
    optionsFailed: 'Не удалось загрузить способы входа. Обновите страницу.',
    asGuest: 'Продолжить без входа',
    terms: 'условия использования',
    privacy: 'политику конфиденциальности',
    consent: (terms: ReactNode, privacy: ReactNode) => (
      <>
        Входя или продолжая без входа, вы принимаете {terms} и {privacy}.
      </>
    ),
    tooManyGuests: 'Слишком много новых гостей с вашего адреса. Попробуйте позже или войдите.',
    guestFailed: 'Не удалось продолжить без входа. Попробуйте ещё раз.',
  },
  en: {
    intro: 'Sign in to work with your boards.',
    failed: 'Could not sign in. Please try again.',
    signInWith: (provider: string) => `Sign in with ${provider}`,
    accountDeleted: 'The account is deleted. A new sign-in creates a new empty account.',
    denied: 'You are not allowed to sign in to this installation of CoDraw. Contact the administrator.',
    notConfigured: 'Signing in is not set up. Contact the administrator.',
    optionsFailed: 'Could not load the ways to sign in. Reload the page.',
    asGuest: 'Continue without signing in',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    consent: (terms: ReactNode, privacy: ReactNode) => (
      <>
        By signing in or continuing without signing in, you accept the {terms} and the {privacy}.
      </>
    ),
    tooManyGuests: 'Too many new guests from your address. Try again later or sign in.',
    guestFailed: 'Could not continue without signing in. Please try again.',
  },
})
