import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FollowBanner, FollowingBanner, PresenterBanner, PresentingBanner } from './FollowBanner.tsx'
import type { Following } from './following.ts'
import type { RemotePresence } from './presence.ts'

const participant = (clientId: number, name: string, color: string): RemotePresence => ({
  clientId,
  name,
  color,
  avatarUrl: null,
  page: 'p1',
  cursor: null,
  selection: [],
  viewport: { x: 0, y: 0, scale: 1 },
  editing: null,
  presenting: null,
  following: null,
  laser: null,
  chat: null,
})
const bob = participant(7, 'Боб', '#dc2626')
const vera = participant(8, 'Вера', '#16a34a')

const following = (state: Partial<Following>): Following => ({
  leader: null,
  presenter: null,
  presenting: false,
  followers: 0,
  follow: vi.fn(),
  stop: vi.fn(),
  startPresenting: vi.fn(),
  stopPresenting: vi.fn(),
  ...state,
})
const banner = (name: string) => screen.getByRole('region', { name })

describe('FollowBanner', () => {
  it('names the participant followed in their colour and stops following', async () => {
    const onStop = vi.fn()
    render(<FollowBanner leader={bob} onStop={onStop} />)

    expect(banner('Следование')).toHaveTextContent('Вы следуете за Боб')
    expect(banner('Следование').style.backgroundColor).toBe('rgb(220, 38, 38)')
    await userEvent.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(onStop).toHaveBeenCalled()
  })
})

describe('PresenterBanner', () => {
  it('names the presenter in their colour and lets a viewer who follows stop', async () => {
    const onStop = vi.fn()
    const onFollow = vi.fn()
    render(<PresenterBanner presenter={bob} following onFollow={onFollow} onStop={onStop} />)

    expect(banner('Показ всем')).toHaveTextContent('Боб показывает всем')
    expect(banner('Показ всем').style.backgroundColor).toBe('rgb(220, 38, 38)')
    await userEvent.click(screen.getByRole('button', { name: 'Не следовать' }))
    expect(onStop).toHaveBeenCalled()
    expect(onFollow).not.toHaveBeenCalled()
  })

  it('lets a viewer who moved away follow again', async () => {
    const onFollow = vi.fn()
    render(<PresenterBanner presenter={bob} following={false} onFollow={onFollow} onStop={vi.fn()} />)

    expect(banner('Показ всем')).toHaveTextContent('Боб показывает всем')
    await userEvent.click(screen.getByRole('button', { name: 'Следовать' }))
    expect(onFollow).toHaveBeenCalled()
  })
})

describe('PresentingBanner', () => {
  it('tells the presenter how many participants follow, in their own colour, and ends the presentation', async () => {
    const onEnd = vi.fn()
    render(<PresentingBanner color="#2563eb" followers={2} onEnd={onEnd} />)

    expect(banner('Показ всем')).toHaveTextContent('Вы показываете всем · следуют 2')
    expect(banner('Показ всем').style.backgroundColor).toBe('rgb(37, 99, 235)')
    await userEvent.click(screen.getByRole('button', { name: 'Закончить показ' }))
    expect(onEnd).toHaveBeenCalled()
  })
})

describe('FollowingBanner', () => {
  it('shows nothing while the participant neither follows nor sees a presentation', () => {
    const { container } = render(<FollowingBanner following={following({})} color="#2563eb" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the presentation of the participant', async () => {
    const state = following({ presenting: true, followers: 1 })
    render(<FollowingBanner following={state} color="#2563eb" />)

    expect(banner('Показ всем')).toHaveTextContent('Вы показываете всем · следуют 1')
    await userEvent.click(screen.getByRole('button', { name: 'Закончить показ' }))
    expect(state.stopPresenting).toHaveBeenCalled()
  })

  it('shows the presentation of another participant, followed or not', async () => {
    const followed = following({ presenter: bob, leader: bob })
    const { rerender } = render(<FollowingBanner following={followed} color="#2563eb" />)
    await userEvent.click(screen.getByRole('button', { name: 'Не следовать' }))
    expect(followed.stop).toHaveBeenCalled()

    const away = following({ presenter: bob })
    rerender(<FollowingBanner following={away} color="#2563eb" />)
    await userEvent.click(screen.getByRole('button', { name: 'Следовать' }))
    expect(away.follow).toHaveBeenCalledWith(7)
  })

  it('shows following a participant who does not present, also while another one presents', () => {
    render(<FollowingBanner following={following({ presenter: bob, leader: vera })} color="#2563eb" />)

    expect(banner('Следование')).toHaveTextContent('Вы следуете за Вера')
    expect(screen.queryByRole('region', { name: 'Показ всем' })).toBeNull()
  })
})
