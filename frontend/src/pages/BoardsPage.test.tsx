import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { ListedBoard, SharedBoard } from '../api/boards.ts'
import { SAMPLE_DRAWIO } from '../drawio/fixtures.ts'
import { takePendingImport } from '../drawio/files.ts'
import { findLocalCopy, openLocalCopy } from '../offline/localCopies.ts'
import { ALICE, mockFetch as mockAnyFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { BoardsPage } from './BoardsPage.tsx'

const board = (id: string, title: string, fields: Partial<ListedBoard> = {}): ListedBoard => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T12:30:00Z',
  linkAccess: 'edit',
  owner: { id: ALICE.id, name: ALICE.name, avatarUrl: ALICE.avatarUrl },
  role: 'owner',
  openedAt: null,
  tags: [],
  folderId: null,
  ...fields,
})

const sharedBoard = (id: string, title: string, owner: string, fields: Partial<SharedBoard> = {}): SharedBoard => ({
  ...board(id, title),
  owner: { id: `id-${owner}`, name: owner, avatarUrl: null },
  role: 'editor',
  openedAt: '2026-10-03T09:00:00Z',
  ...fields,
})

/** Answers the requests of the page; the lists of shared boards and of folders are empty unless given. */
const mockFetch = (responses: Record<string, MockResponse | MockResponse[]>) =>
  mockAnyFetch({ 'GET /api/boards/shared': { body: [] }, 'GET /api/boards/folders': { body: [] }, ...responses })

/** Opens the menu of a board in the list. */
async function openMenu(title: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Меню доски «${title}»` }))
  return screen.findByRole('menu', { name: `Доска «${title}»` })
}

const routes = [
  { path: '/', element: <BoardsPage /> },
  { path: '/boards/:boardId', element: <p>Страница доски</p> },
]

describe('BoardsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists boards in the order returned by the API', async () => {
    mockFetch({ 'GET /api/boards': { body: [board('b', 'Свежая'), board('a', 'Старая')] } })

    renderRoutes(routes)

    await screen.findByRole('link', { name: 'Свежая' })
    // Links of the boards, not those to the documents at the bottom.
    const links = screen.getAllByRole('link').filter((link) => !link.closest('nav'))
    expect(links.map((link) => link.textContent)).toEqual(['Свежая', 'Старая'])
    expect(links[0]).toHaveAttribute('href', '/boards/b')
  })

  it('shows an empty state when there are no boards', async () => {
    mockFetch({ 'GET /api/boards': { body: [] } })

    renderRoutes(routes)

    expect(await screen.findByText('Досок пока нет')).toBeInTheDocument()
  })

  it('shows an error when boards cannot be loaded', async () => {
    mockFetch({ 'GET /api/boards': { status: 500 } })

    renderRoutes(routes)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить доски')
  })

  it('creates a board named "Новая доска" and opens it', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [] },
      'POST /api/boards': { status: 201, body: board('new-id', 'Новая доска') },
    })
    const { router } = renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Создать доску' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/new-id'))
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'Новая доска' })
  })

  it('opens a draw.io file as a new board named after the file', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [] },
      'POST /api/boards': { status: 201, body: board('file-id', 'Платёжный сервис') },
    })
    const { router } = renderRoutes(routes)
    await screen.findByText('Досок пока нет')

    await userEvent.upload(screen.getByLabelText('Файл draw.io'), new File([SAMPLE_DRAWIO], 'Платёжный сервис.drawio'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/file-id'))
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'Платёжный сервис' })
    expect(takePendingImport('file-id')?.map((page) => page.name)).toEqual(['Контекст', 'Слои'])
  })

  it('creates a board from a template, named after it, with the diagram of the template as its page', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [] },
      'POST /api/boards': { status: 201, body: board('template-id', 'ER-диаграмма') },
    })
    const { router } = renderRoutes(routes)
    const templates = await screen.findByRole('region', { name: 'Начать с шаблона' })

    await userEvent.click(within(templates).getByRole('button', { name: /ER-диаграмма/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/template-id'))
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'ER-диаграмма' })
    const pages = takePendingImport('template-id')!
    expect(pages.map((page) => page.name)).toEqual(['ER-диаграмма'])
    expect(pages[0]!.cells.filter((cell) => cell.style.codrawShape === 'table')).toHaveLength(3)
  })

  it('says that the user owns as many boards as allowed when a template runs into the limit', async () => {
    const limitReached = { status: 409, body: { title: 'Board limit reached', limit: 100 } }
    mockFetch({ 'GET /api/boards': { body: [] }, 'POST /api/boards': limitReached })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: /Микросервисы/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Можно держать не больше 100 досок')
  })

  it('says that the user owns as many boards as allowed when creating one runs into the limit', async () => {
    const limitReached = { status: 409, body: { title: 'Board limit reached', limit: 100 } }
    mockFetch({ 'GET /api/boards': { body: [] }, 'POST /api/boards': limitReached })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Создать доску' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Можно держать не больше 100 досок. Удалите ненужные, чтобы создать новую',
    )
  })

  it('says the same when a draw.io file cannot become a board, with the limit in its form', async () => {
    mockFetch({ 'GET /api/boards': { body: [] }, 'POST /api/boards': { status: 409, body: { limit: 21 } } })
    renderRoutes(routes)
    await screen.findByText('Досок пока нет')

    await userEvent.upload(screen.getByLabelText('Файл draw.io'), new File([SAMPLE_DRAWIO], 'Платёжный сервис.drawio'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Можно держать не больше 21 доски.')
  })

  it('does not create a board from a file that is not a draw.io diagram', async () => {
    const fetchMock = mockFetch({ 'GET /api/boards': { body: [] } })
    renderRoutes(routes)
    await screen.findByText('Досок пока нет')

    await userEvent.upload(screen.getByLabelText('Файл draw.io'), new File(['просто текст'], 'заметки.xml'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Это не файл draw.io')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('links to the terms of use and the privacy policy at the bottom', async () => {
    mockFetch({ 'GET /api/boards': { body: [] } })
    renderRoutes(routes)

    const documents = await screen.findByRole('navigation', { name: 'Документы' })
    expect(within(documents).getByRole('link', { name: 'Условия использования' })).toHaveAttribute('href', '/terms')
    expect(within(documents).getByRole('link', { name: 'Политика конфиденциальности' })).toHaveAttribute('href', '/privacy')
  })

  it('lists the boards shared with the user with their owners, with a menu of their tags and folder only', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('own', 'Своя')] },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Платежи', 'Боб'), sharedBoard('y', 'Склад', 'Вера')] },
    })

    renderRoutes(routes)

    const section = await screen.findByRole('region', { name: 'Общие со мной' })
    await within(section).findByRole('link', { name: 'Платежи' })
    expect(within(section).getAllByRole('link').map((link) => link.textContent)).toEqual(['Платежи', 'Склад'])
    expect(within(section).getByRole('link', { name: 'Платежи' })).toHaveAttribute('href', '/boards/x')
    expect(within(section).getByText('Боб')).toBeInTheDocument()
    const menu = await openMenu('Платежи')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Создать копию', 'Теги', 'Переместить в папку'])
  })

  it('shows the role of the user on each shared board, and a board of a member that was never opened', async () => {
    mockFetch({
      'GET /api/boards': { body: [] },
      'GET /api/boards/shared': {
        body: [
          { ...sharedBoard('x', 'Платежи', 'Боб'), role: 'viewer', linkAccess: 'view' },
          sharedBoard('y', 'Склад', 'Вера'),
          { ...sharedBoard('z', 'Новая', 'Глеб'), linkAccess: 'none', openedAt: null },
        ],
      },
    })

    renderRoutes(routes)
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Порядок досок' }), 'Недавно открытые')

    const section = await screen.findByRole('region', { name: 'Общие со мной' })
    const [viewed, edited, joined] = await within(section).findAllByRole('listitem')
    expect(viewed).toHaveTextContent('просмотр')
    expect(viewed).not.toHaveTextContent('редактирование')
    expect(edited).toHaveTextContent('редактирование')
    expect(joined).toHaveTextContent('Не открывалась')
  })

  it('has no section of shared boards when there are none', async () => {
    mockFetch({ 'GET /api/boards': { body: [board('own', 'Своя')] } })

    renderRoutes(routes)

    await screen.findByRole('link', { name: 'Своя' })
    expect(screen.queryByRole('region', { name: 'Общие со мной' })).not.toBeInTheDocument()
  })

  it('copies a board from its menu and opens the copy', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': [{ body: [board('a', 'Платежи')] }, { body: [board('copy', 'Платежи (копия)'), board('a', 'Платежи')] }],
      'POST /api/boards/a/copy': { status: 201, body: board('copy', 'Платежи (копия)') },
    })
    const { router } = renderRoutes(routes)

    await userEvent.click(within(await openMenu('Платежи')).getByRole('menuitem', { name: 'Создать копию' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/copy'))
    expect(fetchMock.mock.calls.filter(([input, init]) => init?.method === 'POST' && input.toString() === '/api/boards/a/copy')).toHaveLength(1)
  })

  it('tells why a board was not copied', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Платежи')] },
      'POST /api/boards/a/copy': { status: 503, body: { title: 'Service Unavailable' } },
    })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Платежи')).getByRole('menuitem', { name: 'Создать копию' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Хранилище изображений недоступно. Повторите позже.')
  })

  it('renames a board from its menu with Enter', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': [{ body: [board('a', 'Новая доска')] }, { body: [board('a', 'Платежи')] }],
      'PATCH /api/boards/a': { body: board('a', 'Платежи') },
    })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Новая доска')).getByRole('menuitem', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название доски' })
    expect(input).toHaveValue('Новая доска')
    await userEvent.clear(input)
    await userEvent.type(input, '  Платежи  {Enter}')

    expect(await screen.findByRole('link', { name: 'Платежи' })).toHaveAttribute('href', '/boards/a')
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'Платежи' })
  })

  it('keeps the title when renaming is cancelled with Escape or the title is left empty', async () => {
    const fetchMock = mockFetch({ 'GET /api/boards': { body: [board('a', 'Схема')] } })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Схема')).getByRole('menuitem', { name: 'Переименовать' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Название доски' }), 'Другая{Escape}')
    await userEvent.click(within(await openMenu('Схема')).getByRole('menuitem', { name: 'Переименовать' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Название доски' }))
    await userEvent.keyboard('   {Enter}')

    expect(screen.getByRole('link', { name: 'Схема' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('deletes a board after the confirmation that names it, with its copy in the browser', async () => {
    const copy = openLocalCopy(ALICE.id, 'a', 'Черновик', new Y.Doc())!
    await copy.whenSynced
    await copy.destroy()
    const fetchMock = mockFetch({
      'GET /api/boards': [{ body: [board('a', 'Черновик'), board('b', 'Схема')] }, { body: [board('b', 'Схема')] }],
      'DELETE /api/boards/a': { status: 204 },
    })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Черновик')).getByRole('menuitem', { name: 'Удалить' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Удаление доски' })
    expect(confirmation).toHaveTextContent('Переместить доску «Черновик» в корзину? Её можно восстановить в течение 30 дней.')
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Черновик' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Схема' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
    await waitFor(() => expect(findLocalCopy(ALICE.id, 'a')).toBeNull())
  })

  it('keeps a board when its deletion is cancelled', async () => {
    const fetchMock = mockFetch({ 'GET /api/boards': { body: [board('a', 'Черновик')] } })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Черновик')).getByRole('menuitem', { name: 'Удалить' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отмена' }))

    expect(screen.getByRole('link', { name: 'Черновик' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })
})

/** The titles of the boards in a part of the page, in their order; links to documents are not boards. */
const boardTitles = (scope: HTMLElement) =>
  within(scope)
    .queryAllByRole('link')
    .filter((link) => link.getAttribute('href')?.startsWith('/boards/'))
    .map((link) => link.textContent)

/** The JSON bodies of the requests sent as `METHOD path`. */
const bodiesOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, path: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === path)
    .map(([, init]) => JSON.parse(init!.body as string) as unknown)

const searchPath = (query: string) => `/api/boards/search?q=${encodeURIComponent(query)}`

describe('BoardsPage search', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps own and shared boards whose title has the query as it is typed, in any case and with «ё» as «е»', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Платёжный сервис'), board('b', 'Склад')] },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Платежи партнёров', 'Боб'), sharedBoard('y', 'Склад Б', 'Вера')] },
      [`GET ${searchPath('платеж')}`]: { body: [] },
    })
    renderRoutes(routes)
    const field = await screen.findByRole('searchbox', { name: 'Поиск досок' })
    await screen.findByRole('link', { name: 'Склад' })

    await userEvent.type(field, 'ПЛАТЕЖ')

    expect(boardTitles(document.body)).toEqual(['Платёжный сервис', 'Платежи партнёров'])
    await userEvent.keyboard('{Escape}')
    expect(field).toHaveValue('')
    expect(boardTitles(document.body)).toHaveLength(4)
  })

  it('searches the texts of boards once typing pauses and shows where the query is on a board', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема'), board('b', 'Склад')] },
      [`GET ${searchPath('email')}`]: { body: [{ boardId: 'a', fragment: '…поле Email_confirmed' }] },
    })
    renderRoutes(routes)
    await screen.findByRole('link', { name: 'Схема' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск досок' }), 'email')

    expect(await screen.findByText('Email')).toHaveProperty('tagName', 'MARK')
    expect(boardTitles(document.body)).toEqual(['Схема'])
    expect(screen.getByRole('link', { name: 'Схема' }).closest('li')).toHaveTextContent(
      'Найдено на доске: …поле Email_confirmed',
    )
    // Typing did not ask about every letter.
    const searches = fetchMock.mock.calls.map(([input]) => input.toString()).filter((path) => path.includes('/search'))
    expect(searches).toEqual([searchPath('email')])
  })

  it('does not search the texts of boards for a single letter', async () => {
    const fetchMock = mockFetch({ 'GET /api/boards': { body: [board('a', 'Схема')] } })
    renderRoutes(routes)

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Поиск досок' }), 'с')
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(screen.getByRole('link', { name: 'Схема' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => input.toString().includes('/search'))).toBe(false)
  })

  it('cancels the search of a query that changed and tells that it searches meanwhile', async () => {
    const signals = new Map<string, AbortSignal>()
    const answer = mockFetch({ 'GET /api/boards': { body: [board('a', 'Схема')] } })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (!input.toString().includes('/search')) return answer(input, init)
      signals.set(input.toString(), init!.signal!)
      // The backend does not answer before the query changes.
      return new Promise<Response>(() => {})
    })
    renderRoutes(routes)
    const field = await screen.findByRole('searchbox', { name: 'Поиск досок' })

    await userEvent.type(field, 'kafka')
    await waitFor(() => expect(signals.has(searchPath('kafka'))).toBe(true))
    expect(screen.getByText('Ищем в тексте досок…')).toBeInTheDocument()
    await userEvent.type(field, ' топик')

    await waitFor(() => expect(signals.get(searchPath('kafka'))!.aborted).toBe(true))
    await waitFor(() => expect(signals.has(searchPath('kafka топик'))).toBe(true))
  })

  it('says that nothing was found and resets the filters', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема')] },
      [`GET ${searchPath('нет такого')}`]: { body: [] },
    })
    renderRoutes(routes)

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Поиск досок' }), 'нет такого')

    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(screen.getByRole('searchbox', { name: 'Поиск досок' })).toHaveValue('')
    expect(boardTitles(document.body)).toEqual(['Схема'])
  })

  it('keeps the boards found by title when the text cannot be searched', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Kafka'), board('b', 'Склад')] },
      [`GET ${searchPath('kafka')}`]: { status: 500 },
    })
    renderRoutes(routes)

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Поиск досок' }), 'kafka')

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось поискать в тексте досок')
    expect(boardTitles(document.body)).toEqual(['Kafka'])
  })
})

describe('BoardsPage order', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const boards = [
    board('a', 'Склад', { updatedAt: '2026-10-05T10:00:00Z', openedAt: '2026-10-04T10:00:00Z' }),
    board('b', 'Архив', { updatedAt: '2026-10-04T10:00:00Z' }),
    board('c', 'Ёлка', { updatedAt: '2026-10-03T10:00:00Z', openedAt: '2026-10-06T10:00:00Z' }),
  ]

  it('orders own and shared boards as chosen, and remembers the choice', async () => {
    mockFetch({
      'GET /api/boards': { body: boards },
      'GET /api/boards/shared': {
        body: [sharedBoard('x', 'Яблоко', 'Боб'), sharedBoard('y', 'Банан', 'Вера', { openedAt: '2026-10-07T00:00:00Z' })],
      },
    })
    const { unmount } = renderRoutes(routes)
    await screen.findByRole('link', { name: 'Яблоко' })
    expect(boardTitles(document.body)).toEqual(['Склад', 'Архив', 'Ёлка', 'Яблоко', 'Банан'])

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Порядок досок' }), 'По названию')
    expect(boardTitles(document.body)).toEqual(['Архив', 'Ёлка', 'Склад', 'Банан', 'Яблоко'])

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Порядок досок' }), 'Недавно открытые')
    expect(boardTitles(document.body)).toEqual(['Ёлка', 'Склад', 'Архив', 'Банан', 'Яблоко'])
    expect(screen.getByRole('link', { name: 'Архив' }).closest('li')).toHaveTextContent('Не открывалась')

    unmount()
    renderRoutes(routes)
    await screen.findByRole('link', { name: 'Яблоко' })
    expect(screen.getByRole('combobox', { name: 'Порядок досок' })).toHaveValue('opened')
    expect(boardTitles(document.body)[0]).toBe('Ёлка')
  })

  it('puts the templates after the shared boards', async () => {
    mockFetch({
      'GET /api/boards': { body: boards },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Яблоко', 'Боб')] },
    })
    renderRoutes(routes)

    const shared = await screen.findByRole('region', { name: 'Общие со мной' })
    const templates = screen.getByRole('region', { name: 'Начать с шаблона' })
    expect(shared.compareDocumentPosition(templates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('BoardsPage tags', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Opens «Теги» in the menu of a board. */
  async function openTags(title: string) {
    await userEvent.click(within(await openMenu(title)).getByRole('menuitem', { name: 'Теги' }))
    return screen.getByRole('group', { name: `Теги доски «${title}»` })
  }

  it('shows the tags of a board and adds one, written as the user wrote it on another board', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема', { tags: ['Бэкенд'] }), board('b', 'Склад')] },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Платежи', 'Боб', { tags: ['Архив'] })] },
      'PUT /api/boards/b/tags': { body: { tags: ['Архив'] } },
    })
    renderRoutes(routes)
    const schema = (await screen.findByRole('link', { name: 'Схема' })).closest('li')!
    expect(schema).toHaveTextContent('Теги: Бэкенд')

    const editor = await openTags('Склад')
    expect(within(editor).getByText('Тегов нет. Их видите только вы.')).toBeInTheDocument()
    await userEvent.type(within(editor).getByRole('textbox', { name: 'Новый тег' }), 'архив{Enter}')

    expect(bodiesOf(fetchMock, 'PUT', '/api/boards/b/tags')).toEqual([{ tags: ['Архив'] }])
    const row = screen.getByRole('link', { name: 'Склад' }).closest('li')!
    await waitFor(() => expect(row).toHaveTextContent('Теги: Архив'))
  })

  it('suggests the tags of the user that the board has not, and removes a tag', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': {
        body: [board('a', 'Схема', { tags: ['Бэкенд', 'Архив'] }), board('b', 'Склад', { tags: ['Срочно'] })],
      },
      'PUT /api/boards/b/tags': [{ body: { tags: ['Срочно', 'Архив'] } }, { body: { tags: ['Архив'] } }],
    })
    renderRoutes(routes)

    const editor = await openTags('Склад')
    await userEvent.type(within(editor).getByRole('textbox', { name: 'Новый тег' }), 'ар')
    const suggestions = within(editor).getByRole('group', { name: 'Подсказки тегов' })
    expect(within(suggestions).getAllByRole('button').map((button) => button.textContent)).toEqual(['Архив'])
    await userEvent.click(within(suggestions).getByRole('button', { name: 'Архив' }))
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Убрать тег «Архив»' })).toBeInTheDocument())
    await userEvent.click(within(editor).getByRole('button', { name: 'Убрать тег «Срочно»' }))

    expect(bodiesOf(fetchMock, 'PUT', '/api/boards/b/tags')).toEqual([{ tags: ['Срочно', 'Архив'] }, { tags: ['Архив'] }])
    await waitFor(() => expect(within(editor).queryByRole('button', { name: 'Убрать тег «Срочно»' })).not.toBeInTheDocument())
  })

  it('takes a tag back and names the limit when the board has as many tags as allowed', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема', { tags: ['Один'] })] },
      'PUT /api/boards/a/tags': { status: 409, body: { title: 'Tag limit reached', limit: 1, scope: 'board' } },
    })
    renderRoutes(routes)

    const editor = await openTags('Схема')
    await userEvent.type(within(editor).getByRole('textbox', { name: 'Новый тег' }), 'Два{Enter}')

    expect(await within(editor).findByRole('alert')).toHaveTextContent('У доски может быть не больше 1 тега')
    expect(within(editor).queryByRole('button', { name: 'Убрать тег «Два»' })).not.toBeInTheDocument()
  })

  it('tags a shared board for the user', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [] },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Платежи', 'Боб')] },
      'PUT /api/boards/x/tags': { body: { tags: ['Моё'] } },
    })
    renderRoutes(routes)

    const editor = await openTags('Платежи')
    await userEvent.type(within(editor).getByRole('textbox', { name: 'Новый тег' }), 'Моё{Enter}')

    expect(bodiesOf(fetchMock, 'PUT', '/api/boards/x/tags')).toEqual([{ tags: ['Моё'] }])
    const section = screen.getByRole('region', { name: 'Общие со мной' })
    await waitFor(() => expect(section).toHaveTextContent('Теги: Моё'))
  })

  it('keeps the boards that have all the chosen tags, and a tag chosen again keeps all', async () => {
    mockFetch({
      'GET /api/boards': {
        body: [
          board('a', 'Схема', { tags: ['Бэкенд', 'Архив'] }),
          board('b', 'Склад', { tags: ['Бэкенд'] }),
          board('c', 'Пусто'),
        ],
      },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Платежи', 'Боб', { tags: ['бэкенд'] })] },
    })
    renderRoutes(routes)
    const filters = await screen.findByRole('group', { name: 'Фильтр по тегам' })
    expect(within(filters).getAllByRole('button').map((button) => button.textContent)).toEqual(['Архив', 'Бэкенд'])

    await userEvent.click(within(filters).getByRole('button', { name: 'Бэкенд' }))
    expect(boardTitles(document.body)).toEqual(['Схема', 'Склад', 'Платежи'])
    await userEvent.click(within(filters).getByRole('button', { name: 'Архив' }))
    expect(boardTitles(document.body)).toEqual(['Схема'])
    expect(within(filters).getByRole('button', { name: 'Архив' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(filters).getByRole('button', { name: 'Архив' }))
    await userEvent.click(within(filters).getByRole('button', { name: 'Бэкенд' }))
    expect(boardTitles(document.body)).toHaveLength(4)
  })
})

describe('BoardsPage folders', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const work = { id: 'work', name: 'Работа' }
  const home = { id: 'home', name: 'Дом' }

  it('shows the boards of a folder, those in no folder, and says when a folder has none', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема', { folderId: 'work' }), board('b', 'Склад')] },
      'GET /api/boards/shared': { body: [sharedBoard('x', 'Платежи', 'Боб', { folderId: 'work' })] },
      'GET /api/boards/folders': { body: [work, home] },
    })
    renderRoutes(routes)
    const bar = await screen.findByRole('group', { name: 'Папки' })
    await screen.findByRole('link', { name: 'Платежи' })
    expect(within(bar).getAllByRole('button', { pressed: false }).map((button) => button.textContent)).toEqual([
      'Без папки',
      'Дом',
      'Работа',
    ])
    expect(screen.getByRole('link', { name: 'Схема' }).closest('li')).toHaveTextContent('Папка: Работа')

    await userEvent.click(within(bar).getByRole('button', { name: 'Работа' }))
    expect(boardTitles(document.body)).toEqual(['Схема', 'Платежи'])
    expect(screen.getByRole('link', { name: 'Схема' }).closest('li')).not.toHaveTextContent('Папка: Работа')
    await userEvent.click(within(bar).getByRole('button', { name: 'Без папки' }))
    expect(boardTitles(document.body)).toEqual(['Склад'])
    await userEvent.click(within(bar).getByRole('button', { name: 'Дом' }))
    expect(screen.getByText('В папке нет досок')).toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Все доски' }))
    expect(boardTitles(document.body)).toHaveLength(3)
  })

  it('creates a folder over the list', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема')] },
      'POST /api/boards/folders': { status: 201, body: work },
    })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Новая папка' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Новая папка' }), ' Работа {Enter}')

    expect(bodiesOf(fetchMock, 'POST', '/api/boards/folders')).toEqual([{ name: 'Работа' }])
    const bar = screen.getByRole('group', { name: 'Папки' })
    expect(await within(bar).findByRole('button', { name: 'Работа' })).toBeInTheDocument()
  })

  it('says that a folder of that name exists', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема')] },
      'GET /api/boards/folders': { body: [work] },
      'POST /api/boards/folders': { status: 409, body: { title: 'Folder name taken' } },
    })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Новая папка' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Новая папка' }), 'работа{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Папка с таким названием уже есть')
  })

  it('renames the chosen folder and deletes it after a confirmation, and its boards are in no folder', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема', { folderId: 'work' })] },
      'GET /api/boards/folders': { body: [work] },
      'PATCH /api/boards/folders/work': { body: { id: 'work', name: 'Проекты' } },
      'DELETE /api/boards/folders/work': { status: 204 },
    })
    renderRoutes(routes)
    const bar = await screen.findByRole('group', { name: 'Папки' })
    await userEvent.click(within(bar).getByRole('button', { name: 'Работа' }))

    await userEvent.click(within(bar).getByRole('button', { name: 'Меню папки «Работа»' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Переименовать папку' }))
    const input = within(bar).getByRole('textbox', { name: 'Название папки' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Проекты{Enter}')
    expect(bodiesOf(fetchMock, 'PATCH', '/api/boards/folders/work')).toEqual([{ name: 'Проекты' }])
    expect(within(bar).getByRole('button', { name: 'Проекты' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(bar).getByRole('button', { name: 'Меню папки «Проекты»' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить папку' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Удаление папки' })
    expect(confirmation).toHaveTextContent('Удалить папку «Проекты»? Доски из неё останутся в списке без папки.')
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Проекты' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Схема' }).closest('li')).not.toHaveTextContent('Папка')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
  })

  it('moves a board into a folder from its menu, and into a new folder created there', async () => {
    const fetchMock = mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема'), board('b', 'Склад')] },
      'GET /api/boards/folders': { body: [work] },
      'PUT /api/boards/a/folder': { status: 204 },
      'PUT /api/boards/b/folder': { status: 204 },
      'POST /api/boards/folders': { status: 201, body: home },
    })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Схема')).getByRole('menuitem', { name: 'Переместить в папку' }))
    const picker = screen.getByRole('menu', { name: 'Папка доски «Схема»' })
    expect(within(picker).getByRole('menuitemradio', { name: 'Без папки' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(picker).getByRole('menuitemradio', { name: 'Работа' }))
    expect(bodiesOf(fetchMock, 'PUT', '/api/boards/a/folder')).toEqual([{ folderId: 'work' }])
    expect(screen.getByRole('link', { name: 'Схема' }).closest('li')).toHaveTextContent('Папка: Работа')

    await userEvent.click(within(await openMenu('Склад')).getByRole('menuitem', { name: 'Переместить в папку' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Новая папка' }), 'Дом{Enter}')
    await waitFor(() => expect(bodiesOf(fetchMock, 'PUT', '/api/boards/b/folder')).toEqual([{ folderId: 'home' }]))
    expect(bodiesOf(fetchMock, 'POST', '/api/boards/folders')).toEqual([{ name: 'Дом' }])
    await waitFor(() => expect(screen.getByRole('link', { name: 'Склад' }).closest('li')).toHaveTextContent('Папка: Дом'))
  })

  it('puts a board back when the move fails', async () => {
    mockFetch({
      'GET /api/boards': { body: [board('a', 'Схема')] },
      'GET /api/boards/folders': { body: [work] },
      'PUT /api/boards/a/folder': { status: 500 },
    })
    renderRoutes(routes)

    await userEvent.click(within(await openMenu('Схема')).getByRole('menuitem', { name: 'Переместить в папку' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Работа' }))

    const row = screen.getByRole('link', { name: 'Схема' }).closest('li')!
    expect(await within(row).findByRole('alert')).toHaveTextContent('Не удалось переместить доску')
    expect(row).not.toHaveTextContent('Папка: Работа')
  })
})
