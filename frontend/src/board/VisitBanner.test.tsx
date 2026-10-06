import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VisitBanner } from './VisitBanner.tsx'

const anya = { id: 'anya', name: 'Аня', avatarUrl: 'https://avatars.example.com/anya.png' }
const bob = { id: 'bob', name: 'Боб', avatarUrl: null }

describe('VisitBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 10, 0))
  })

  afterEach(() => vi.useRealTimers())

  const since = new Date(2026, 9, 5, 18, 40).toISOString()

  it('tells when the user was on the board and who changed it since, with their marks', () => {
    render(<VisitBanner since={since} authors={[anya, bob]} onShow={() => {}} onHide={() => {}} />)

    const banner = screen.getByRole('region', { name: 'С прошлого визита' })
    expect(banner).toHaveTextContent('С вашего прошлого визита (вчера в 18:40) доску изменили Аня и Боб')
    expect(within(banner).getAllByTestId('version-author').map((mark) => mark.textContent)).toEqual(['', 'Б'])
  })

  it('says «изменил(а)» of one author', () => {
    render(<VisitBanner since={since} authors={[bob]} onShow={() => {}} onHide={() => {}} />)

    expect(screen.getByRole('region')).toHaveTextContent('доску изменил(а) Боб')
  })

  it('shows the changes and hides itself on request', async () => {
    const onShow = vi.fn()
    const onHide = vi.fn()
    render(<VisitBanner since={since} authors={[bob]} onShow={onShow} onHide={onHide} />)

    await userEvent.click(screen.getByRole('button', { name: 'Показать изменения' }))
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }))

    expect(onShow).toHaveBeenCalledOnce()
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('offers no changes to show without a version to compare with', () => {
    render(<VisitBanner since={since} authors={[bob]} onShow={null} onHide={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Показать изменения' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Скрыть' })).toBeInTheDocument()
  })
})
