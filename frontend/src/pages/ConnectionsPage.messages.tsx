import type { ReactNode } from 'react'
import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the page of the connections of the user: GitHub. */
export const connectionsMessages = defineMessages({
  ru: {
    title: 'Подключения',
    intro:
      'Привязывайте задачи GitHub к элементам схемы и веткам обсуждений, создавайте задачи прямо из CoDraw и видьте их номер, название и статус на доске.',
    guest: 'Подключения доступны после входа через GitHub или Google.',
    signIn: 'Войти',
    loading: 'Загрузка…',
    forbidden: 'Подключения доступны после входа',
    loadFailed: 'Не удалось загрузить подключения',
    unavailable: 'На этом сервере задачи GitHub не подключены.',
    connected: 'Подключено',
    tokenRejected: 'GitHub больше не принимает токен',
    since: 'с',
    enterNewToken: ' Введите новый токен: до тех пор ваши задачи на досках не обновляются.',
    newToken: 'Новый токен',
    accessToken: 'Токен доступа',
    fineGrainedToken: 'fine-grained токен',
    tokenHint: (token: ReactNode) => (
      <>
        Создайте {token} с доступом только к нужным репозиториям и правом «Issues: Read and write» и сроком действия.
        Токен — секрет: CoDraw хранит его на сервере, больше не покажет и использует только по вашим действиям. Задачи,
        которые вы привяжете, увидят все, кто может открыть доску.
      </>
    ),
    connectFailed: 'Не удалось подключить GitHub',
    disconnectFailed: 'Не удалось отключить GitHub',
    replaceToken: 'Заменить токен',
    connect: 'Подключить',
    disconnect: 'Отключить',
    afterDisconnect:
      'После отключения привязанные вами задачи остаются на досках, но их статус перестаёт обновляться, пока кто-то не возьмёт их на себя.',
  },
  en: {
    title: 'Connections',
    intro:
      'Link GitHub issues to elements of diagrams and to threads, create issues right from CoDraw and see their number, title and status on the board.',
    guest: 'Connections are available after signing in with GitHub or Google.',
    signIn: 'Sign in',
    loading: 'Loading…',
    forbidden: 'Connections are available after signing in',
    loadFailed: 'Could not load the connections',
    unavailable: 'GitHub issues are not set up on this server.',
    connected: 'Connected',
    tokenRejected: 'GitHub no longer accepts the token',
    since: 'since',
    enterNewToken: ' Enter a new token: until then your issues on the boards are not updated.',
    newToken: 'New token',
    accessToken: 'Access token',
    fineGrainedToken: 'fine-grained token',
    tokenHint: (token: ReactNode) => (
      <>
        Create a {token} with access only to the repositories you need, the “Issues: Read and write” permission and an
        expiration date. The token is a secret: CoDraw keeps it on the server, never shows it again and uses it only when
        you act. Issues you link are seen by everyone who can open the board.
      </>
    ),
    connectFailed: 'Could not connect GitHub',
    disconnectFailed: 'Could not disconnect GitHub',
    replaceToken: 'Replace token',
    connect: 'Connect',
    disconnect: 'Disconnect',
    afterDisconnect:
      'After disconnecting, the issues you linked stay on the boards, but their status stops updating until someone takes them over.',
  },
})
