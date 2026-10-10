import type { ReactNode } from 'react'
import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the login page. */
export const loginMessages = defineMessages({
  ru: {
    intro: 'Войдите, чтобы работать со своими досками.',
    failed: 'Вход не выполнен. Попробуйте ещё раз.',
    withGithub: 'Войти через GitHub',
    withGoogle: 'Войти через Google',
    asGuest: 'Продолжить без входа',
    terms: 'условия использования',
    privacy: 'политику конфиденциальности',
    consent: (terms: ReactNode, privacy: ReactNode) => (
      <>
        Входя или продолжая без входа, вы принимаете {terms} и {privacy}.
      </>
    ),
    tooManyGuests: 'Слишком много новых гостей с вашего адреса. Попробуйте позже или войдите через GitHub или Google.',
    guestFailed: 'Не удалось продолжить без входа. Попробуйте ещё раз.',
  },
  en: {
    intro: 'Sign in to work with your boards.',
    failed: 'Could not sign in. Please try again.',
    withGithub: 'Sign in with GitHub',
    withGoogle: 'Sign in with Google',
    asGuest: 'Continue without signing in',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    consent: (terms: ReactNode, privacy: ReactNode) => (
      <>
        By signing in or continuing without signing in, you accept the {terms} and the {privacy}.
      </>
    ),
    tooManyGuests: 'Too many new guests from your address. Try again later or sign in with GitHub or Google.',
    guestFailed: 'Could not continue without signing in. Please try again.',
  },
})
