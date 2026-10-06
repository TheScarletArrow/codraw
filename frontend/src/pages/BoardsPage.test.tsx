import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { Board, SharedBoard } from '../api/boards.ts'
import { SAMPLE_DRAWIO } from '../drawio/fixtures.ts'
import { takePendingImport } from '../drawio/files.ts'
import { findLocalCopy, openLocalCopy } from '../offline/localCopies.ts'
import { ALICE, mockFetch as mockAnyFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { BoardsPage } from './BoardsPage.tsx'

const board = (id: string, title: string): Board => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T12:30:00Z',
  linkAccess: 'edit',
  owner: { id: ALICE.id, name: ALICE.name, avatarUrl: ALICE.avatarUrl },
  role: 'owner',
})

const sharedBoard = (id: string, title: string, owner: string): SharedBoard => ({
  ...board(id, title),
  owner: { id: `id-${owner}`, name: owner, avatarUrl: null },
  role: 'editor',
  openedAt: '2026-10-03T09:00:00Z',
})

/** Answers the requests of the page; the list of shared boards is empty unless given. */
const mockFetch = (responses: Record<string, MockResponse | MockResponse[]>) =>
  mockAnyFetch({ 'GET /api/boards/shared': { body: [] }, ...responses })

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

  it('lists the boards shared with the user with their owners, without the menu of the owner', async () => {
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
    expect(within(section).queryByRole('button', { name: /Меню доски/ })).not.toBeInTheDocument()
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
    expect(confirmation).toHaveTextContent('Удалить доску «Черновик»? Её нельзя будет восстановить.')
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
