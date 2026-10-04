import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import { SAMPLE_DRAWIO } from '../drawio/fixtures.ts'
import { takePendingImport } from '../drawio/files.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { BoardsPage } from './BoardsPage.tsx'

const board = (id: string, title: string): Board => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T12:30:00Z',
})

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

    const links = await screen.findAllByRole('link')
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

  it('does not create a board from a file that is not a draw.io diagram', async () => {
    const fetchMock = mockFetch({ 'GET /api/boards': { body: [] } })
    renderRoutes(routes)
    await screen.findByText('Досок пока нет')

    await userEvent.upload(screen.getByLabelText('Файл draw.io'), new File(['просто текст'], 'заметки.xml'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Это не файл draw.io')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
