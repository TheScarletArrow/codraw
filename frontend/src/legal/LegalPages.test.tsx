import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LegalInfo } from '../api/legal.ts'
import { setLocale } from '../i18n/i18n.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { legalMessages } from './messages.ts'
import { PrivacyPage } from './PrivacyPage.tsx'
import { TermsPage } from './TermsPage.tsx'

const routes = [
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
]

const legal = (changes: Partial<LegalInfo> = {}): LegalInfo => ({
  operator: 'ООО «Пример»',
  contactEmail: 'privacy@example.com',
  guestBoardRetentionDays: 14,
  guestSessionDays: 30,
  versionsPerBoard: 100,
  notificationRetentionDays: 60,
  notificationsPerUser: 200,
  closedProposalsPerBoard: 10,
  schemaImport: false,
  issues: false,
  ...changes,
})

describe('legal pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes days in Russian', () => {
    expect([1, 2, 5, 14, 21, 22, 30].map(legalMessages.days)).toEqual(['1 день', '2 дня', '5 дней', '14 дней', '21 день', '22 дня', '30 дней'])
  })

  it('writes days in English in the English interface', () => {
    setLocale('en')
    expect([1, 2, 21].map(legalMessages.days)).toEqual(['1 day', '2 days', '21 days'])
  })

  it('names the operator and states the data, cookies and retention of the installation', async () => {
    mockFetch({ 'GET /api/legal': { body: legal() } })
    renderRoutes(routes, '/privacy')

    expect(await screen.findByRole('heading', { name: 'Политика конфиденциальности', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/Оператор сервиса — ООО «Пример»/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy@example.com' })).toHaveAttribute('href', 'mailto:privacy@example.com')
    for (const section of ['Какие данные мы обрабатываем', 'Cookie', 'Копии досок в браузере', 'Сколько хранятся данные', 'Ваши права']) {
      expect(screen.getByRole('region', { name: section })).toBeInTheDocument()
    }
    const retention = screen.getByRole('region', { name: 'Сколько хранятся данные' })
    expect(retention).toHaveTextContent('когда с ними 14 дней никто не работал')
    expect(retention).toHaveTextContent('не больше 100 последних версий; версии с названием удаляются последними')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'кто из участников менял доску между версиями',
    )
    expect(screen.getByRole('region', { name: 'Cookie' })).toHaveTextContent('SESSION')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Библиотеки фигур. Личные библиотеки пользователя: их названия и компоненты',
    )
    expect(retention).toHaveTextContent('Библиотеки фигур с компонентами — пока пользователь их не удалит, и не дольше учётной записи')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'имя участника, который закрепил элемент доски',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'имя и идентификатор участника, который последним изменил элемент, и время этого изменения',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'статус элемента («Черновик», «Нужно ревью», «Готово») с именем и идентификатором участника, который его поставил, и временем',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'попросил ревью элемента его доски, — с доской, комментарием, веткой, предложением или страницей и элементом',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent('Участие в досках')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'кто в каком пространстве участник и с какой ролью',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'кто какой реакцией отметил комментарий и кто назначен ответственным за ветку',
    )
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'реакции с именами отреагировавших, ответственных за ветки',
    )
    expect(retention).toHaveTextContent('Реакции удалённого пользователя удаляются, а назначенные ему ветки остаются без ответственного')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Архитектурные решения. Номер, название, статус и текст решений доски, день решения, кто его записал',
    )
    expect(retention).toHaveTextContent('Решения — пока их не удалят владелец или редакторы доски, и не дольше самой доски')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'ответственных за ветки, архитектурные решения с именами записавших их, присутствие друг друга',
    )
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'список участников доски с их ролями; владелец видит ещё и тех, кто открывал доску по ссылке, и запросы доступа с именем, аватаром и сообщением того, кто просит',
    )
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'Кто из участников менял доску между версиями, видят те, кому доступна история версий, — владелец и редакторы',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Запросы доступа. Какую роль пользователь попросил у владельца чужой доски, его сообщение владельцу',
    )
    expect(retention).toHaveTextContent('Запрос доступа — пока владелец не ответит на него или пользователь его не отменит')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Уведомления. Кто и что сделал, что касается пользователя',
    )
    expect(retention).toHaveTextContent('Уведомления — не дольше 60 дней и не больше 200 последних у пользователя')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'Уведомление видит только тот, кому оно адресовано',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Уведомления вне CoDraw. Если вы их настроили: адрес почты и отметка о том, что вы его подтвердили по ссылке из письма, адрес входящего вебхука вашего чата',
    )
    expect(retention).toHaveTextContent('Адрес почты, вебхук и доски без уведомлений — пока вы их не удалите')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'уходит почтовому серверу этой установки на ваш адрес и сервису чата, адрес вебхука которого вы ввели',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Визиты досок. Когда пользователь последний раз был на каждой доске',
    )
    expect(retention).toHaveTextContent('Время визитов доски — пока у пользователя есть доступ к ней')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'а кто менял её с прошлого визита участника — сам вернувшийся участник, в том числе с ролью «Просмотр»; время визитов, теги, папки и библиотеки фигур не видит никто, кроме самого пользователя, — ни владелец, ни другие участники общей доски',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Предложения изменений. Автор предложения, его название и описание, черновик доски',
    )
    expect(retention).toHaveTextContent(
      'Предложения изменений: открытое — пока его не примут, не отклонят или автор его не отзовёт, а из закрытых у доски хранятся 10 последних',
    )
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'Предложение изменений с его черновиком видят его автор, владелец и редакторы доски',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Изображения. Картинки, которые участники кладут на доски',
    )
    expect(retention).toHaveTextContent('Изображения доски — пока существует доска, даже если на доске их больше нет')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'сервер отдаёт изображение доски только тем, кому доступна доска',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Теги и папки. Теги, которые пользователь дал своим и общим доскам своего списка, его папки',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Для поиска досок рядом с документом доски хранится её текст',
    )
    expect(retention).toHaveTextContent('теги и папка общей доски — пока у пользователя есть доступ к ней')
    expect(retention).toHaveTextContent('Текст доски для поиска — пока есть её документ')
    const copies = screen.getByRole('region', { name: 'Копии досок в браузере' })
    expect(copies).toHaveTextContent('и выбранный порядок списка досок')
    expect(copies).toHaveTextContent('не больше 20 последних открытых вами досок')
    expect(copies).toHaveTextContent('Выход из CoDraw удаляет ваши копии')
    expect(copies).toHaveTextContent('очисткой данных этого сайта')
    expect(copies).toHaveTextContent('свёрнута ли мини-карта холста (localStorage, ключ codraw.minimap)')
    expect(copies).toHaveTextContent('цвет, который вы последним выбрали для стикеров (localStorage)')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'имя и идентификатор участника, который написал текст стикера',
    )
    expect(copies).toHaveTextContent('Тему оформления, выбранную в меню «Тема», — «Светлая» или «Тёмная» — браузер тоже помнит')
    expect(copies).toHaveTextContent(
      'Язык интерфейса, выбранный в меню «Язык», браузер тоже помнит (localStorage, ключ codraw.locale), чтобы сразу открывать CoDraw на нём',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'У учётной записи хранится и язык интерфейса — выбранный в меню «Язык», а если вы его не выбирали, язык браузера при входе, — чтобы письма и сообщения уведомлений приходили на нём',
    )
    expect(screen.getByText('Обновлено 10 октября 2026 г.')).toBeInTheDocument()
    expect(screen.queryByText(/This is a translation/)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'видит любой, у кого есть ссылка, без входа, в том числе на чужих сайтах, куда её встроили; комментарии, участников и присутствие он не видит',
    )
    expect(screen.getByRole('link', { name: 'Условия использования' })).toHaveAttribute('href', '/terms')
  })

  it('names the token of GitHub and linked issues only when the installation links issues', async () => {
    mockFetch({ 'GET /api/legal': { body: legal({ issues: true }) } })
    const { unmount } = renderRoutes(routes, '/privacy')

    const data = await screen.findByRole('region', { name: 'Какие данные мы обрабатываем' })
    expect(data).toHaveTextContent('Задачи GitHub. Если вы подключили GitHub: ваш токен доступа и имя учётной записи GitHub')
    expect(data).toHaveTextContent('токен хранится на сервере и никому не показывается, в том числе вам')
    expect(screen.getByRole('region', { name: 'Сколько хранятся данные' })).toHaveTextContent(
      'Токен GitHub — пока вы не отключите GitHub или не замените токен, и не дольше учётной записи',
    )
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'Номер, название и статус привязанной задачи, в том числе из закрытого репозитория, и имя того, кто её привязал, видят все, кому доступна доска. Больше никому',
    )
    unmount()

    mockFetch({ 'GET /api/legal': { body: legal() } })
    renderRoutes(routes, '/privacy')
    expect(await screen.findByRole('region', { name: 'Какие данные мы обрабатываем' })).not.toHaveTextContent('Задачи GitHub')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'после сохранения. Больше никому данные не передаются и не продаются.',
    )
  })

  it('names the connection to a database only when the installation has it on', async () => {
    mockFetch({ 'GET /api/legal': { body: legal({ schemaImport: true }) } })
    const { unmount } = renderRoutes(routes, '/privacy')

    const data = await screen.findByRole('region', { name: 'Какие данные мы обрабатываем' })
    expect(data).toHaveTextContent(
      'Подключение к базе данных. Чтобы загрузить в «Импорт SQL» схему базы PostgreSQL, вы вводите адрес и порт её сервера, имя базы, пользователя и пароль.',
    )
    expect(data).toHaveTextContent('и не сохраняет их; в журнал сервера попадают адрес и порт сервера базы и результат')
    expect(screen.getByRole('region', { name: 'Сколько хранятся данные' })).toHaveTextContent(
      'Учётные данные базы данных — только на время одного подключения к ней; они не хранятся.',
    )
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'GitHub и Google узнают о входе через них по своим правилам. Адрес, имя базы, пользователя и пароль, которые вы вводите, чтобы загрузить схему базы данных, сервер CoDraw передаёт только этой базе. Участники доски',
    )
    unmount()

    mockFetch({ 'GET /api/legal': { body: legal() } })
    renderRoutes(routes, '/privacy')
    expect(await screen.findByRole('region', { name: 'Какие данные мы обрабатываем' })).not.toHaveTextContent('базе данных')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'GitHub и Google узнают о входе через них по своим правилам. Участники доски',
    )
  })

  it('says when the operator has not named themselves', async () => {
    mockFetch({ 'GET /api/legal': { body: legal({ operator: null, contactEmail: null }) } })
    renderRoutes(routes, '/terms')

    expect(await screen.findByText(/Оператор этой установки CoDraw не указал свои данные/)).toBeInTheDocument()
    const service = screen.getByRole('region', { name: 'Сервис' })
    expect(within(service).getByRole('link', { name: 'политику конфиденциальности' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('region', { name: 'Содержимое досок' })).toHaveTextContent(
      'режим «Все, у кого есть ссылка, без входа» открывает доску для просмотра и без входа',
    )
  })

  it('shows the policy in English, as a translation, with the settings of the installation', async () => {
    setLocale('en')
    mockFetch({ 'GET /api/legal': { body: legal({ issues: true, schemaImport: true }) } })
    renderRoutes(routes, '/privacy')

    expect(await screen.findByRole('heading', { name: 'Privacy policy', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/The operator of the service is ООО «Пример»/)).toBeInTheDocument()
    expect(screen.getByText('Updated October 10, 2026')).toBeInTheDocument()
    expect(screen.getByText('This is a translation for convenience; the Russian version prevails.')).toBeInTheDocument()
    for (const section of ['What data we process', 'Cookies', 'Copies of boards in the browser', 'How long the data is kept', 'Your rights']) {
      expect(screen.getByRole('region', { name: section })).toBeInTheDocument()
    }
    const retention = screen.getByRole('region', { name: 'How long the data is kept' })
    expect(retention).toHaveTextContent('when no one has worked with them for 14 days')
    expect(retention).toHaveTextContent('Each board keeps no more than the last 100 versions')
    expect(retention).toHaveTextContent('Notifications — no longer than 60 days and no more than the last 200 of a user')
    expect(retention).toHaveTextContent('The GitHub token — until you disconnect GitHub')
    expect(retention).toHaveTextContent('Database credentials — only for the time of one connection to it')
    const copies = screen.getByRole('region', { name: 'Copies of boards in the browser' })
    expect(copies).toHaveTextContent(
      'The browser also remembers the language of the interface chosen in the “Language” menu (localStorage, key codraw.locale), so that CoDraw opens in it at once',
    )
    expect(copies).toHaveTextContent('whether the minimap of the canvas is collapsed (localStorage, key codraw.minimap)')
    expect(screen.getByRole('region', { name: 'What data we process' })).toHaveTextContent(
      'The account also stores the language of the interface — the one chosen in the “Language” menu or, if you have not chosen one, the language of the browser at sign-in — so that emails and messages of notifications arrive in it.',
    )
    expect(screen.getByRole('region', { name: 'Cookies' })).toHaveTextContent('For a guest it is kept for 30 days after the last request.')
    // Only the name of the operator, which the installation gives, is in Russian.
    expect(screen.getByRole('main').textContent?.replace('ООО «Пример»', '')).not.toMatch(/[А-Яа-яЁё]/)
    expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Back to CoDraw' })).toHaveAttribute('href', '/')
  })

  it('shows the terms in English, as a translation', async () => {
    setLocale('en')
    mockFetch({ 'GET /api/legal': { body: legal({ operator: null, contactEmail: null }) } })
    renderRoutes(routes, '/terms')

    expect(await screen.findByRole('heading', { name: 'Terms of use', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/The operator of this installation of CoDraw has not provided their details/)).toBeInTheDocument()
    expect(screen.getByText('Updated October 9, 2026')).toBeInTheDocument()
    expect(screen.getByText('This is a translation for convenience; the Russian version prevails.')).toBeInTheDocument()
    const service = screen.getByRole('region', { name: 'The service' })
    expect(within(service).getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('main')).not.toHaveTextContent(/[А-Яа-яЁё]/)
  })
})
