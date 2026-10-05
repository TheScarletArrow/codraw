import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import type { Embed } from '../api/embed.ts'
import { createQueryClient } from '../queryClient.ts'
import { mockFetch } from '../test/render.tsx'
import { EmbedSection } from './EmbedSection.tsx'

const board: Board = {
  id: '0199a000-0000-7000-8000-000000000001',
  title: 'Архитектура',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'edit',
  owner: { id: 'alice', name: 'Алиса', avatarUrl: null },
  role: 'owner',
}
const embedUrl = `/api/boards/${board.id}/embed`
const embed: Embed = { path: '/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg', pageId: 'page-2', updatedAt: null }
const pages = [
  { id: 'page-1', name: 'Обзор' },
  { id: 'page-2', name: 'Данные' },
]

function renderSection(props: Partial<Parameters<typeof EmbedSection>[0]> = {}) {
  const onChanged = vi.fn()
  render(
    <QueryClientProvider client={createQueryClient()}>
      <EmbedSection board={board} embed={null} pages={pages} pageId="page-1" document={null} onChanged={onChanged} {...props} />
    </QueryClientProvider>,
  )
  return { onChanged }
}

describe('EmbedSection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lets the owner turn the live image of the current page on and tells the others', async () => {
    const fetchMock = mockFetch({ [`PUT ${embedUrl}`]: { body: { ...embed, pageId: 'page-1' } } })
    const { onChanged } = renderSection()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Живая картинка' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(JSON.parse(String(init!.body))).toEqual({ pageId: 'page-1' })
  })

  it('shows the address, copies it and the Markdown, warns that it is public, and changes the page', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const fetchMock = mockFetch({ [`PUT ${embedUrl}`]: { body: { ...embed, pageId: 'page-1' } } })
    renderSection({ embed })

    expect(screen.getByRole('textbox', { name: 'Ссылка на картинку' })).toHaveValue(
      `${location.origin}/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg`,
    )
    expect(screen.getByRole('region', { name: 'Живая картинка' })).toHaveTextContent('даже если доступ к доске закрыт')
    await user.click(screen.getByRole('button', { name: 'Копировать Markdown' }))
    expect(writeText).toHaveBeenLastCalledWith(`![Архитектура](${location.origin}/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg)`)
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Страница картинки' }), 'page-1')
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
  })

  it('turns the image off', async () => {
    const fetchMock = mockFetch({ [`DELETE ${embedUrl}`]: { status: 204 } })
    const { onChanged } = renderSection({ embed })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Живая картинка' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
  })

  it('shows other participants the address only, and nothing while the image is off', () => {
    renderSection({ board: { ...board, role: 'editor' }, embed })
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Ссылка на картинку' })).toBeInTheDocument()

    document.body.innerHTML = ''
    renderSection({ board: { ...board, role: 'viewer' }, embed: null })
    expect(screen.queryByRole('region', { name: 'Живая картинка' })).toBeNull()
  })
})
