import { defineMessages } from './i18n/i18n.ts'

/** The texts of the frame of the pages: the header and the menu of the user. */
export const layoutMessages = defineMessages({
  ru: {
    loading: 'Загрузка…',
    profileFailed: 'Не удалось загрузить профиль',
    connections: 'Подключения',
    connectionsHint: 'Подключения: GitHub',
    signIn: 'Войти',
    signOut: 'Выйти',
  },
  en: {
    loading: 'Loading…',
    profileFailed: 'Could not load the profile',
    connections: 'Connections',
    connectionsHint: 'Connections: GitHub',
    signIn: 'Sign in',
    signOut: 'Sign out',
  },
})
