import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductStats } from '../api/adminStats.ts'
import { AdminPage } from '../pages/AdminPage.tsx'
import { ALICE, mockFetch, renderRoutes } from '../test/render.tsx'

const ADMIN = { ...ALICE, id: 'admin', name: 'Админ', admin: true }
const routes = [{ path: '/admin', element: <AdminPage /> }]

const stats: ProductStats = {
  date: '2026-10-12',
  collectedSince: '2026-09-20',
  activeUsers: [
    { days: 1, accounts: 3, guests: 1 },
    { days: 7, accounts: 12, guests: 4 },
    { days: 28, accounts: 30, guests: 9 },
  ],
  periods: [
    { days: 7, newAccounts: 5, guestConversions: 2, editedBoards: 8, coEditedBoards: 2 },
    { days: 28, newAccounts: 14, guestConversions: 6, editedBoards: 0, coEditedBoards: 0 },
  ],
  cohorts: [
    { from: '2026-09-22', to: '2026-09-28', accounts: 4, returned: 1, complete: true },
    { from: '2026-09-15', to: '2026-09-21', accounts: 3, returned: 0, complete: true },
    { from: '2026-09-08', to: '2026-09-14', accounts: 2, returned: 0, complete: false },
    { from: '2026-09-01', to: '2026-09-07', accounts: 0, returned: 0, complete: false },
  ],
}

async function openStatistics(body: ProductStats | undefined, status = 200) {
  mockFetch({
    'GET /api/me': { body: ADMIN },
    'GET /api/admin/reports?status=open': { body: [] },
    'GET /api/admin/stats': { status, body },
  })
  renderRoutes(routes, '/admin')
  await userEvent.click(await screen.findByRole('tab', { name: 'Статистика' }))
}

/** The texts of the cells of the row of the table with this header, with the spaces of numbers as plain spaces. */
const row = (table: HTMLElement, name: string) =>
  within(within(table).getByRole('rowheader', { name }).closest('tr')!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent?.replace(/\s/g, ' '))

describe('AdminStats', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the active users, the new accounts and the guests who signed in over their periods', async () => {
    await openStatistics(stats)

    const active = await screen.findByRole('table', { name: 'Активные пользователи' })
    expect(within(active).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['1 день', '7 дней', '28 дней'])
    expect(row(active, 'Учётные записи')).toEqual(['3', '12', '30'])
    expect(row(active, 'Гости')).toEqual(['1', '4', '9'])
    const growth = screen.getByRole('table', { name: 'Новые учётные записи' })
    expect(row(growth, 'Созданы')).toEqual(['5', '14'])
    expect(row(growth, 'Гости, вошедшие в учётную запись')).toEqual(['2', '6'])
    expect(screen.getByText(/Дни активности собираются с 20 сент\./)).toBeInTheDocument()
  })

  it('shows the share of each cohort that came back, and no data for a cohort without its days', async () => {
    await openStatistics(stats)

    const retention = await screen.findByRole('table', { name: 'Удержание первой недели' })
    expect(row(retention, 'Созданы 22 сент. – 28 сент.')).toEqual(['4', '1', '25 %'])
    expect(row(retention, 'Созданы 15 сент. – 21 сент.')).toEqual(['3', '0', '0 %'])
    expect(row(retention, 'Созданы 8 сент. – 14 сент.')).toEqual(['2', 'нет данных', 'нет данных'])
  })

  it('shows the boards edited together and their share, and no share without edited boards', async () => {
    await openStatistics(stats)

    const collaboration = await screen.findByRole('table', { name: 'Совместная работа' })
    expect(row(collaboration, 'Изменённые доски')).toEqual(['8', '0'])
    expect(row(collaboration, 'Доски, которые правили вместе')).toEqual(['2', '0'])
    expect(row(collaboration, 'Доля правки вместе')).toEqual(['25 %', 'нет данных'])
  })

  it('tells when the statistics do not load', async () => {
    await openStatistics(undefined, 500)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить')
  })
})
