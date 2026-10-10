import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the page of a board. */
export const boardPageMessages = defineMessages({
  ru: {
    status: {
      connecting: 'Подключение',
      synced: 'Синхронизировано',
      offline: 'Нет связи',
      'not-found': 'Доска не найдена',
      forbidden: 'Нет доступа',
    },
    loading: 'Загрузка…',
    loadFailed: 'Не удалось загрузить доску',
    workspace: (name: string) => `Пространство «${name}»`,
    readOnly: 'Только просмотр',
    savedLocally: 'Нет связи — правки сохраняются на этом устройстве',
    unsent: 'Не отправлено: есть правки',
    tooLarge: 'Доска достигла предельного размера, последнее изменение не сохранено. Удалите лишнее, чтобы продолжить',
    gotIt: 'Понятно',
    empty: 'Доска пока пуста',
    loadingBoard: 'Загрузка доски…',
  },
  en: {
    status: {
      connecting: 'Connecting',
      synced: 'Synced',
      offline: 'Offline',
      'not-found': 'Board not found',
      forbidden: 'No access',
    },
    loading: 'Loading…',
    loadFailed: 'Could not load the board',
    workspace: (name: string) => `Workspace “${name}”`,
    readOnly: 'View only',
    savedLocally: 'Offline — edits are saved on this device',
    unsent: 'Not sent: there are edits',
    tooLarge: 'The board has reached its maximum size, the last change was not saved. Delete something to continue',
    gotIt: 'Got it',
    empty: 'The board is empty so far',
    loadingBoard: 'Loading the board…',
  },
})
