import { defineMessages } from './i18n/i18n.ts'

/** The texts of the frame of the pages: the header and the menu of the user. */
export const layoutMessages = defineMessages({
  ru: {
    loading: 'Загрузка…',
    profileFailed: 'Не удалось загрузить профиль',
    account: 'Учётная запись',
    accountHint: 'Учётная запись: скачать данные или удалить',
    connections: 'Подключения',
    connectionsHint: 'Подключения: GitHub',
    signIn: 'Войти',
    signOut: 'Выйти',
  },
  en: {
    loading: 'Loading…',
    profileFailed: 'Could not load the profile',
    account: 'Account',
    accountHint: 'Account: download your data or delete it',
    connections: 'Connections',
    connectionsHint: 'Connections: GitHub',
    signIn: 'Sign in',
    signOut: 'Sign out',
  },
})
