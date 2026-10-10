import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the page of a board shown to anybody by its link. */
export const publicBoardMessages = defineMessages({
  ru: {
    unavailable: 'Доска недоступна без входа',
    loading: 'Загрузка…',
    openBoard: 'Открыть доску',
    signIn: 'Войти',
    loadFailed: 'Не удалось загрузить доску',
    empty: 'Доска пока пуста',
    readOnly: 'Только просмотр',
    openInCodraw: 'Открыть в CoDraw',
  },
  en: {
    unavailable: 'The board is not available without signing in',
    loading: 'Loading…',
    openBoard: 'Open board',
    signIn: 'Sign in',
    loadFailed: 'Could not load the board',
    empty: 'The board is empty so far',
    readOnly: 'View only',
    openInCodraw: 'Open in CoDraw',
  },
})
