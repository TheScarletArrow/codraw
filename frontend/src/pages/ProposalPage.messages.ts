import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the page of the draft of a change proposal. */
export const proposalPageMessages = defineMessages({
  ru: {
    status: {
      connecting: 'Подключение',
      synced: 'Синхронизировано',
      offline: 'Нет связи',
      'not-found': 'Предложение не найдено',
      forbidden: 'Нет доступа',
    },
    loading: 'Загрузка…',
    loadFailed: 'Не удалось загрузить предложение',
    boardNotFound: 'Доска не найдена',
    readOnly: 'Только просмотр',
    withdrawFailed: 'Не удалось отозвать предложение',
    toBoard: 'К доске',
    withdraw: 'Отозвать',
    withdrawing: 'Отзыв предложения',
    withdrawWarning: 'Предложение закроется, а его черновик останется только для просмотра.',
    tooLarge: 'Черновик достиг предельного размера, последнее изменение не сохранено. Удалите лишнее, чтобы продолжить',
    gotIt: 'Понятно',
    empty: 'Черновик пока пуст',
    loadingDraft: 'Загрузка черновика…',
    closed: (title: string, status: string) => `Предложение «${title}» — ${status}: черновик только для просмотра`,
    mine: (title: string) => `Предложение «${title}»: правки не попадают на доску, пока их не примут`,
    others: (title: string, board: string, author: string) =>
      `Черновик предложения «${title}» к доске «${board}» от ${author} — только для просмотра`,
  },
  en: {
    status: {
      connecting: 'Connecting',
      synced: 'Synced',
      offline: 'Offline',
      'not-found': 'Proposal not found',
      forbidden: 'No access',
    },
    loading: 'Loading…',
    loadFailed: 'Could not load the proposal',
    boardNotFound: 'Board not found',
    readOnly: 'View only',
    withdrawFailed: 'Could not withdraw the proposal',
    toBoard: 'To the board',
    withdraw: 'Withdraw',
    withdrawing: 'Withdrawing the proposal',
    withdrawWarning: 'The proposal will be closed, and its draft will stay view only.',
    tooLarge: 'The draft has reached its maximum size, the last change was not saved. Delete something to continue',
    gotIt: 'Got it',
    empty: 'The draft is empty so far',
    loadingDraft: 'Loading the draft…',
    closed: (title: string, status: string) => `Proposal “${title}” — ${status}: the draft is view only`,
    mine: (title: string) => `Proposal “${title}”: your edits do not reach the board until they are accepted`,
    others: (title: string, board: string, author: string) =>
      `Draft of the proposal “${title}” to the board “${board}” by ${author} — view only`,
  },
})
