import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import type { AccessRequest } from '../api/accessRequests.ts'
import type { Invite, Participant } from '../api/members.ts'
import { createQueryClient } from '../queryClient.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { ShareButton } from './ShareButton.tsx'

const board: Board = {
  id: '0199a000-0000-7000-8000-000000000001',
  title: 'Архитектура',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'none',
  owner: { id: 'alice', name: 'Алиса', avatarUrl: null },
  role: 'owner',
}
const boardUrl = `/api/boards/${board.id}`
const members: Participant[] = [
  { id: 'alice', name: 'Алиса', avatarUrl: null, role: 'owner' },
  { id: 'bob', name: 'Боб', avatarUrl: 'https://avatars.example.com/bob.png', role: 'editor' },
]
const invite: Invite = { id: 'invite-1', path: '/invite/AAAAAAAAAAAAAAAAAAAAAA', role: 'editor', createdAt: '2026-10-01T10:00:00Z' }
const request: AccessRequest = {
  id: 'request-1',
  userId: 'carol',
  name: 'Вера',
  avatarUrl: 'https://avatars.example.com/carol.png',
  role: 'editor',
  message: 'Нужно поправить схему БД',
  createdAt: '2026-10-01T11:00:00Z',
}

function renderShare(responses: Record<string, MockResponse | MockResponse[]> = {}, shown: Board = board) {
  const fetchMock = mockFetch({
    [`GET ${boardUrl}/members`]: { body: members },
    [`GET ${boardUrl}/visitors`]: { body: [] },
    [`GET ${boardUrl}/invites`]: { body: [] },
    [`GET ${boardUrl}/access-requests`]: { body: [] },
    ...responses,
  })
  const queryClient = createQueryClient()
  const onChanged = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <ShareButton board={shown} pageId="page-1" onChanged={onChanged} />
    </QueryClientProvider>,
  )
  return { fetchMock, onChanged, queryClient }
}

async function openShare() {
  await userEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
  return screen.findByRole('list', { name: 'Участники доски' })
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  JSON.parse(String(requests(fetchMock, method, url)[0]![1]!.body)) as unknown

describe('ShareButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  describe('participants', () => {
    it('lists the owner first and the members with their roles', async () => {
      renderShare()

      const list = await openShare()
      const [owner, bob] = await within(list).findAllByRole('listitem')
      expect(owner).toHaveAccessibleName('Алиса')
      expect(owner).toHaveTextContent('Владелец')
      expect(within(bob).getByRole('combobox', { name: 'Роль: Боб' })).toHaveValue('editor')
    })

    it('lets the owner change the role of a member and tells the other participants', async () => {
      const { fetchMock, onChanged } = renderShare({
        [`PUT ${boardUrl}/members/bob`]: { body: { ...members[1], role: 'viewer' } },
      })
      await openShare()

      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Роль: Боб' }), 'Просмотр')

      await waitFor(() => expect(onChanged).toHaveBeenCalled())
      expect(bodyOf(fetchMock, 'PUT', `${boardUrl}/members/bob`)).toEqual({ role: 'viewer' })
      await waitFor(() => expect(requests(fetchMock, 'GET', `${boardUrl}/members`)).toHaveLength(2))
    })

    it('lets the owner remove a member', async () => {
      const { fetchMock, onChanged } = renderShare({
        [`GET ${boardUrl}/members`]: [{ body: members }, { body: [members[0]] }],
        [`DELETE ${boardUrl}/members/bob`]: { status: 204 },
      })
      const list = await openShare()

      await userEvent.click(within(await within(list).findByRole('listitem', { name: 'Боб' })).getByRole('button', { name: 'Убрать' }))

      await waitFor(() => expect(within(list).queryByRole('listitem', { name: 'Боб' })).toBeNull())
      expect(requests(fetchMock, 'DELETE', `${boardUrl}/members/bob`)).toHaveLength(1)
      expect(onChanged).toHaveBeenCalled()
    })

    it('makes a member the owner after confirmation and keeps the board as its previous owner sees it now', async () => {
      const { fetchMock, onChanged, queryClient } = renderShare({
        [`PUT ${boardUrl}/owner`]: { body: { ...board, owner: { id: 'bob', name: 'Боб', avatarUrl: null }, role: 'editor' } },
        [`GET ${boardUrl}/members`]: [
          { body: members },
          { body: [{ ...members[1], role: 'owner' }, { ...members[0], role: 'editor' }] },
        ],
        'GET /api/boards': { body: [] },
        'GET /api/boards/shared': { body: [] },
      })
      const list = await openShare()
      const bob = await within(list).findByRole('listitem', { name: 'Боб' })

      await userEvent.click(within(bob).getByRole('button', { name: 'Сделать владельцем' }))
      const confirmation = screen.getByRole('alertdialog', { name: 'Передача владения' })
      expect(confirmation).toHaveTextContent('Боб станет владельцем доски, а вы останетесь на ней с ролью «Редактирование».')
      expect(requests(fetchMock, 'PUT', `${boardUrl}/owner`)).toHaveLength(0)
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Сделать владельцем' }))

      await waitFor(() => expect(onChanged).toHaveBeenCalled())
      expect(bodyOf(fetchMock, 'PUT', `${boardUrl}/owner`)).toEqual({ userId: 'bob' })
      expect(queryClient.getQueryData<Board>(['boards', board.id])?.role).toBe('editor')
      expect(screen.queryByRole('alertdialog', { name: 'Передача владения' })).toBeNull()
    })

    it('says that the new owner owns as many boards as allowed', async () => {
      renderShare({
        [`PUT ${boardUrl}/owner`]: { status: 409, body: { title: 'Board limit reached', limit: 100 } },
      })
      const list = await openShare()

      await userEvent.click(within(await within(list).findByRole('listitem', { name: 'Боб' })).getByRole('button', { name: 'Сделать владельцем' }))
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Сделать владельцем' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Новый владелец уже владеет 100 досками — больше нельзя')
    })

    it('lets the owner add who opened the board through its link, as an editor', async () => {
      const { fetchMock } = renderShare({
        [`GET ${boardUrl}/visitors`]: { body: [{ id: 'carol', name: 'Вера', avatarUrl: null, visitedAt: '2026-10-01T11:00:00Z' }] },
        [`PUT ${boardUrl}/members/carol`]: { body: { id: 'carol', name: 'Вера', avatarUrl: null, role: 'editor' } },
      })
      await openShare()

      const visitors = await screen.findByRole('region', { name: 'Открывали по ссылке' })
      await userEvent.click(within(visitors).getByRole('button', { name: 'Добавить' }))

      await waitFor(() => expect(requests(fetchMock, 'PUT', `${boardUrl}/members/carol`)).toHaveLength(1))
      expect(bodyOf(fetchMock, 'PUT', `${boardUrl}/members/carol`)).toEqual({ role: 'editor' })
    })

    it('says that the board has as many members as allowed', async () => {
      renderShare({
        [`GET ${boardUrl}/visitors`]: { body: [{ id: 'carol', name: 'Вера', avatarUrl: null, visitedAt: '2026-10-01T11:00:00Z' }] },
        [`PUT ${boardUrl}/members/carol`]: { status: 409, body: { title: 'Member limit reached', limit: 100 } },
      })
      await openShare()

      await userEvent.click(within(await screen.findByRole('region', { name: 'Открывали по ссылке' })).getByRole('button', { name: 'Добавить' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('На доске уже 100 участников — больше добавить нельзя')
    })

    it('shows the others the participants without managing them, and nothing of invitations', async () => {
      const { fetchMock } = renderShare({}, { ...board, role: 'editor' })

      const list = await openShare()

      const bob = await within(list).findByRole('listitem', { name: 'Боб' })
      expect(bob).toHaveTextContent('Редактирование')
      expect(screen.queryByRole('combobox', { name: /Роль/ })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Убрать' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Пригласить по ссылке' })).toBeNull()
      expect(requests(fetchMock, 'GET', `${boardUrl}/visitors`)).toHaveLength(0)
      expect(requests(fetchMock, 'GET', `${boardUrl}/invites`)).toHaveLength(0)
      expect(requests(fetchMock, 'GET', `${boardUrl}/access-requests`)).toHaveLength(0)
      expect(screen.queryByRole('region', { name: 'Запросы доступа' })).toBeNull()
    })
  })

  describe('requests for access', () => {
    /** Opens «Поделиться» with one request waiting and returns its item. */
    async function openRequest() {
      await userEvent.click(await screen.findByRole('button', { name: 'Поделиться (1 запрос доступа)' }))
      const section = await screen.findByRole('region', { name: 'Запросы доступа' })
      return within(section).getByRole('listitem', { name: 'Вера' })
    }

    it('counts the requests on the button and shows who asks for what, why and when', async () => {
      renderShare({ [`GET ${boardUrl}/access-requests`]: { body: [request, { ...request, id: 'request-2', userId: 'dan', name: 'Дан', role: 'viewer', message: null }] } })

      expect(await screen.findByRole('button', { name: 'Поделиться (2 запроса доступа)' })).toHaveTextContent('2')
      await userEvent.click(screen.getByRole('button', { name: 'Поделиться (2 запроса доступа)' }))

      const section = await screen.findByRole('region', { name: 'Запросы доступа' })
      const [vera, dan] = within(section).getAllByRole('listitem')
      expect(vera).toHaveAccessibleName('Вера')
      expect(vera).toHaveTextContent('Просит редактирование')
      expect(vera).toHaveTextContent('Нужно поправить схему БД')
      expect(within(vera).getByRole('time')).toHaveAttribute('dateTime', '2026-10-01T11:00:00Z')
      expect(dan).toHaveTextContent('Просит просмотр')
    })

    it('fetches the requests again when the window opens', async () => {
      const { fetchMock } = renderShare()
      await waitFor(() => expect(requests(fetchMock, 'GET', `${boardUrl}/access-requests`)).toHaveLength(1))

      await openShare()

      await waitFor(() => expect(requests(fetchMock, 'GET', `${boardUrl}/access-requests`)).toHaveLength(2))
      expect(screen.queryByRole('region', { name: 'Запросы доступа' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Поделиться' })).toBeInTheDocument()
    })

    it('gives editing, tells the other participants and shows the new member', async () => {
      const { fetchMock, onChanged } = renderShare({
        [`GET ${boardUrl}/access-requests`]: [{ body: [request] }, { body: [request] }, { body: [] }],
        [`GET ${boardUrl}/members`]: [{ body: members }, { body: [...members, { id: 'carol', name: 'Вера', avatarUrl: null, role: 'editor' }] }],
        [`POST ${boardUrl}/access-requests/request-1/grant`]: { body: { id: 'carol', name: 'Вера', avatarUrl: null, role: 'editor' } },
      })

      await userEvent.click(within(await openRequest()).getByRole('button', { name: 'Дать редактирование' }))

      await waitFor(() => expect(screen.queryByRole('region', { name: 'Запросы доступа' })).toBeNull())
      expect(bodyOf(fetchMock, 'POST', `${boardUrl}/access-requests/request-1/grant`)).toEqual({ role: 'editor' })
      expect(onChanged).toHaveBeenCalled()
      const participants = screen.getByRole('list', { name: 'Участники доски' })
      expect(await within(participants).findByRole('combobox', { name: 'Роль: Вера' })).toHaveValue('editor')
      expect(screen.getByRole('button', { name: 'Поделиться' })).toBeInTheDocument()
    })

    it('gives viewing in place of the editing asked for', async () => {
      const { fetchMock } = renderShare({
        [`GET ${boardUrl}/access-requests`]: { body: [request] },
        [`POST ${boardUrl}/access-requests/request-1/grant`]: { body: { id: 'carol', name: 'Вера', avatarUrl: null, role: 'viewer' } },
      })

      await userEvent.click(within(await openRequest()).getByRole('button', { name: 'Дать просмотр' }))

      await waitFor(() => expect(requests(fetchMock, 'POST', `${boardUrl}/access-requests/request-1/grant`)).toHaveLength(1))
      expect(bodyOf(fetchMock, 'POST', `${boardUrl}/access-requests/request-1/grant`)).toEqual({ role: 'viewer' })
    })

    it('declines without telling the other participants', async () => {
      const { fetchMock, onChanged } = renderShare({
        [`GET ${boardUrl}/access-requests`]: [{ body: [request] }, { body: [request] }, { body: [] }],
        [`DELETE ${boardUrl}/access-requests/request-1`]: { status: 204 },
      })

      await userEvent.click(within(await openRequest()).getByRole('button', { name: 'Отклонить' }))

      await waitFor(() => expect(screen.queryByRole('region', { name: 'Запросы доступа' })).toBeNull())
      expect(requests(fetchMock, 'DELETE', `${boardUrl}/access-requests/request-1`)).toHaveLength(1)
      expect(onChanged).not.toHaveBeenCalled()
    })

    it('says that the request changed meanwhile and shows the requests anew', async () => {
      const replaced = { ...request, id: 'request-2', role: 'viewer' as const }
      renderShare({
        [`GET ${boardUrl}/access-requests`]: [{ body: [request] }, { body: [request] }, { body: [replaced] }],
        [`POST ${boardUrl}/access-requests/request-1/grant`]: { status: 404 },
      })

      await userEvent.click(within(await openRequest()).getByRole('button', { name: 'Дать редактирование' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Запрос уже отменён или изменён — посмотрите его ещё раз')
      expect(await screen.findByText('Просит просмотр')).toBeInTheDocument()
    })

    it('says that the board has as many members as allowed', async () => {
      renderShare({
        [`GET ${boardUrl}/access-requests`]: { body: [request] },
        [`POST ${boardUrl}/access-requests/request-1/grant`]: { status: 409, body: { title: 'Member limit reached', limit: 100 } },
      })

      await userEvent.click(within(await openRequest()).getByRole('button', { name: 'Дать редактирование' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('На доске уже 100 участников — больше добавить нельзя')
    })
  })

  describe('invitations', () => {
    it('creates an invitation with the chosen role and shows its link', async () => {
      const viewing: Invite = { ...invite, id: 'invite-2', role: 'viewer' }
      const { fetchMock } = renderShare({
        [`GET ${boardUrl}/invites`]: [{ body: [] }, { body: [viewing] }],
        [`POST ${boardUrl}/invites`]: { status: 201, body: viewing },
      })
      await openShare()
      const section = await screen.findByRole('region', { name: 'Пригласить по ссылке' })

      await userEvent.selectOptions(within(section).getByRole('combobox', { name: 'Роль приглашённых' }), 'Просмотр')
      await userEvent.click(within(section).getByRole('button', { name: 'Создать ссылку' }))

      expect(await within(section).findByRole('textbox', { name: 'Ссылка-приглашение: Просмотр' })).toHaveValue(
        `${location.origin}/invite/AAAAAAAAAAAAAAAAAAAAAA`,
      )
      expect(bodyOf(fetchMock, 'POST', `${boardUrl}/invites`)).toEqual({ role: 'viewer' })
    })

    it('copies an invitation and revokes it', async () => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      const { fetchMock } = renderShare({
        [`GET ${boardUrl}/invites`]: [{ body: [invite] }, { body: [] }],
        [`DELETE ${boardUrl}/invites/invite-1`]: { status: 204 },
      })
      await openShare()
      const section = await screen.findByRole('region', { name: 'Пригласить по ссылке' })
      const item = await within(section).findByRole('listitem', { name: /^Приглашение: Редактирование/ })

      await userEvent.click(within(item).getByRole('button', { name: 'Копировать' }))
      expect(writeText).toHaveBeenCalledWith(`${location.origin}/invite/AAAAAAAAAAAAAAAAAAAAAA`)
      expect(within(item).getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()

      await userEvent.click(within(item).getByRole('button', { name: 'Отозвать' }))
      await waitFor(() => expect(within(section).queryByRole('listitem')).toBeNull())
      expect(requests(fetchMock, 'DELETE', `${boardUrl}/invites/invite-1`)).toHaveLength(1)
    })

    it('says that the board has as many invitations as allowed', async () => {
      renderShare({ [`POST ${boardUrl}/invites`]: { status: 409, body: { title: 'Invitation limit reached', limit: 20 } } })
      await openShare()

      await userEvent.click(await screen.findByRole('button', { name: 'Создать ссылку' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('У доски уже 20 приглашений — отзовите ненужные')
    })
  })
})
