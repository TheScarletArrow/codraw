import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LegalInfo } from '../api/legal.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { days } from './LegalPage.tsx'
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
  ...changes,
})

describe('legal pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes days in Russian', () => {
    expect([1, 2, 5, 14, 21, 22, 30].map(days)).toEqual(['1 день', '2 дня', '5 дней', '14 дней', '21 день', '22 дня', '30 дней'])
  })

  it('names the operator and states the data, cookies and retention of the installation', async () => {
    mockFetch({ 'GET /api/legal': { body: legal() } })
    renderRoutes(routes, '/privacy')

    expect(await screen.findByRole('heading', { name: 'Политика конфиденциальности', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/Оператор сервиса — ООО «Пример»/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy@example.com' })).toHaveAttribute('href', 'mailto:privacy@example.com')
    for (const section of ['Какие данные мы обрабатываем', 'Cookie', 'Сколько хранятся данные', 'Ваши права']) {
      expect(screen.getByRole('region', { name: section })).toBeInTheDocument()
    }
    const retention = screen.getByRole('region', { name: 'Сколько хранятся данные' })
    expect(retention).toHaveTextContent('когда с ними 14 дней никто не работал')
    expect(retention).toHaveTextContent('не больше 100 последних версий')
    expect(screen.getByRole('region', { name: 'Cookie' })).toHaveTextContent('SESSION')
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'имя участника, который закрепил элемент доски',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'имя и идентификатор участника, который последним изменил элемент, и время этого изменения',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent('Участие в досках')
    expect(screen.getByRole('region', { name: 'Кому передаются данные' })).toHaveTextContent(
      'список участников доски с их ролями; владелец видит ещё и тех, кто открывал доску по ссылке, и запросы доступа с именем, аватаром и сообщением того, кто просит',
    )
    expect(screen.getByRole('region', { name: 'Какие данные мы обрабатываем' })).toHaveTextContent(
      'Запросы доступа. Какую роль пользователь попросил у владельца чужой доски, его сообщение владельцу',
    )
    expect(retention).toHaveTextContent('Запрос доступа — пока владелец не ответит на него или пользователь его не отменит')
    expect(screen.getByRole('link', { name: 'Условия использования' })).toHaveAttribute('href', '/terms')
  })

  it('says when the operator has not named themselves', async () => {
    mockFetch({ 'GET /api/legal': { body: legal({ operator: null, contactEmail: null }) } })
    renderRoutes(routes, '/terms')

    expect(await screen.findByText(/Оператор этой установки CoDraw не указал свои данные/)).toBeInTheDocument()
    const service = screen.getByRole('region', { name: 'Сервис' })
    expect(within(service).getByRole('link', { name: 'политику конфиденциальности' })).toHaveAttribute('href', '/privacy')
  })
})
