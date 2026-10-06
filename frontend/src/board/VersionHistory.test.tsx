import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { BoardVersion, VersionAuthor } from '../api/versions.ts'
import { getCells, initializeDocument } from '../diagram/model.ts'
import { createQueryClient } from '../queryClient.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { participantColor } from './identity.ts'
import { VersionHistory } from './VersionHistory.tsx'

const boardId = '0199a000-0000-7000-8000-000000000001'
const versionsUrl = `/api/boards/${boardId}/versions`

const author = (id: string, name: string, avatarUrl: string | null = null): VersionAuthor => ({ id, name, avatarUrl })
const anna = author('0199a000-0000-7000-8000-0000000000a1', 'Аня')
const boris = author('0199a000-0000-7000-8000-0000000000b1', 'Боб', 'https://avatars.example.com/bob.png')

const version = (id: string, changes: Partial<BoardVersion> = {}): BoardVersion => ({
  id,
  createdAt: '2026-10-06T09:00:00Z',
  reason: 'auto',
  name: null,
  authors: [],
  ...changes,
})

function renderHistory(versions: BoardVersion[], responses: Record<string, MockResponse | MockResponse[]> = {}) {
  const fetchMock = mockFetch({ [`GET ${versionsUrl}`]: { body: versions }, ...responses })
  const document = new Y.Doc()
  initializeDocument(document)
  const onSelect = vi.fn()
  const queryClient = createQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <VersionHistory boardId={boardId} document={document} selectedId={null} onSelect={onSelect} onClose={() => {}} />
    </QueryClientProvider>,
  )
  return { fetchMock, document, onSelect }
}

const requestsOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

/** The item of the version whose text has this name or reason. */
const item = async (text: string) =>
  (await screen.findAllByRole('listitem')).find((element) => element.textContent?.startsWith(text))!

describe('VersionHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the name of a version, or its reason without one, its time and its authors', async () => {
    renderHistory([
      version('v2', { reason: 'manual', name: 'Схема v1', authors: [anna, boris] }),
      version('v1', { authors: [] }),
    ])

    const named = await item('Схема v1')
    expect(named).toHaveTextContent('Вручную')
    expect(within(named).getByRole('button', { name: /^Схема v1.*Изменили: Аня, Боб$/ })).toBeInTheDocument()
    const marks = within(named).getAllByTestId('version-author')
    // Аня has no avatar: the first letter of her name in her colour; Боб has his avatar.
    expect(marks[0]).toHaveTextContent('А')
    expect(marks[0]).toHaveStyle({ backgroundColor: participantColor(anna.id) })
    expect(marks[1]).toHaveAttribute('src', boris.avatarUrl)

    const unnamed = await item('Автоматически')
    expect(unnamed.textContent).not.toContain('Изменили')
  })

  it('shows the first three authors and counts the others', async () => {
    const authors = ['Аня', 'Боб', 'Вера', 'Гена', 'Дима'].map((name, index) => author(`id-${index}`, name))
    renderHistory([version('v1', { authors })])

    const entry = await item('Автоматически')
    expect(within(entry).getAllByTestId('version-author')).toHaveLength(3)
    expect(within(entry).getByText('Аня, Боб, Вера')).toBeInTheDocument()
    expect(within(entry).getByText('+2')).toBeInTheDocument()
    expect(within(entry).getByTitle('Изменили: Аня, Боб, Вера, Гена, Дима')).toBeInTheDocument()
  })

  it('saves the current state of the board as a version with the name given', async () => {
    const url = `${versionsUrl}?reason=manual&name=${encodeURIComponent('Схема v1')}`
    const { fetchMock, document } = renderHistory([], {
      [`POST ${url}`]: { status: 201, body: version('v1', { reason: 'manual', name: 'Схема v1' }) },
    })
    getCells(document).set('kept', new Y.Map(Object.entries({ kind: 'vertex', parent: '1', order: 'a0' })))

    const field = screen.getByRole('textbox', { name: 'Название версии' })
    await userEvent.type(field, '  Схема v1 {Enter}')

    await waitFor(() => expect(requestsOf(fetchMock, 'POST', url)).toHaveLength(1))
    const saved = new Y.Doc()
    Y.applyUpdate(saved, requestsOf(fetchMock, 'POST', url)[0]![1]!.body as Uint8Array)
    expect(getCells(saved).has('kept')).toBe(true)
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('saves a version without a name when none is given', async () => {
    const url = `${versionsUrl}?reason=manual`
    const { fetchMock } = renderHistory([], { [`POST ${url}`]: { status: 201, body: version('v1', { reason: 'manual' }) } })

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }))

    await waitFor(() => expect(requestsOf(fetchMock, 'POST', url)).toHaveLength(1))
  })

  it('renames a version in place', async () => {
    const url = `${versionsUrl}/v1`
    const { fetchMock, onSelect } = renderHistory([version('v1', { reason: 'manual', name: 'Схема v1', authors: [anna] })], {
      [`PATCH ${url}`]: { body: version('v1', { reason: 'manual', name: 'Схема v2', authors: [anna] }) },
    })

    await userEvent.click(within(await item('Схема v1')).getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Новое название версии' })
    expect(input).toHaveValue('Схема v1')
    await userEvent.clear(input)
    await userEvent.type(input, 'Схема v2{Enter}')

    expect(await item('Схема v2')).toHaveTextContent('Аня')
    expect(JSON.parse(String(requestsOf(fetchMock, 'PATCH', url)[0]![1]!.body))).toEqual({ name: 'Схема v2' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('takes the name of a version away when it is emptied, and keeps it on Escape', async () => {
    const url = `${versionsUrl}/v1`
    const { fetchMock } = renderHistory([version('v1', { reason: 'manual', name: 'Схема v1' })], {
      [`PATCH ${url}`]: { body: version('v1', { reason: 'manual' }) },
    })

    await userEvent.click(within(await item('Схема v1')).getByRole('button', { name: 'Переименовать' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Новое название версии' }), 'Другое{Escape}')
    expect(await item('Схема v1')).toBeInTheDocument()
    expect(requestsOf(fetchMock, 'PATCH', url)).toHaveLength(0)

    await userEvent.click(within(await item('Схема v1')).getByRole('button', { name: 'Переименовать' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Новое название версии' }))
    await userEvent.keyboard('{Enter}')

    expect(await item('Вручную')).toBeInTheDocument()
    expect(JSON.parse(String(requestsOf(fetchMock, 'PATCH', url)[0]![1]!.body))).toEqual({ name: null })
  })
})
