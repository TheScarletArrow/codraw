import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { participantColor } from '../board/identity.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { LastChange } from './LastChange.tsx'

const BOB_ID = '0199a000-0000-7000-8000-00000000000b'
const NOW = new Date(2026, 9, 6, 14, 30).getTime()
const MINUTE = 60_000

const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

describe('LastChange', () => {
  afterEach(() => vi.useRealTimers())

  it('says who changed the selected element and how long ago, with the exact time in its tooltip', () => {
    vi.useFakeTimers({ now: NOW })
    const editor = createFakeEditor()
    render(<LastChange editor={editor} />)
    expect(screen.queryByTestId('last-change')).toBeNull()

    act(() => editor.setState({ attribution: { by: BOB_ID, name: 'Боб', at: NOW - 5 * MINUTE, mine: false } }))

    const line = screen.getByTestId('last-change')
    expect(line).toHaveTextContent('Изменено: Боб, 5 минут назад')
    expect(line).toHaveAttribute('title', '6 окт. 2026 г., 14:25')
    expect(line.querySelector('span[aria-hidden]')).toHaveStyle({ backgroundColor: toRgb(participantColor(BOB_ID)) })
  })

  it('marks the participant’s own change and goes without a color when the element keeps no id', () => {
    vi.useFakeTimers({ now: NOW })
    const editor = createFakeEditor()
    render(<LastChange editor={editor} />)

    act(() => editor.setState({ attribution: { by: BOB_ID, name: 'Боб', at: NOW, mine: true } }))
    expect(screen.getByTestId('last-change')).toHaveTextContent('Изменено: Боб (вы), только что')

    act(() => editor.setState({ attribution: { by: null, name: 'Гость 12', at: NOW, mine: false } }))
    expect(screen.getByTestId('last-change')).toHaveTextContent('Изменено: Гость 12, только что')
    expect(screen.getByTestId('last-change').querySelector('span[aria-hidden]')).toBeNull()
  })

  it('counts the time again while it is shown, and hides when the selection keeps nobody', () => {
    vi.useFakeTimers({ now: NOW })
    const editor = createFakeEditor()
    render(<LastChange editor={editor} />)
    act(() => editor.setState({ attribution: { by: BOB_ID, name: 'Боб', at: NOW, mine: false } }))
    expect(screen.getByTestId('last-change')).toHaveTextContent('Изменено: Боб, только что')

    act(() => vi.advanceTimersByTime(2 * MINUTE))
    expect(screen.getByTestId('last-change')).toHaveTextContent('Изменено: Боб, 2 минуты назад')

    act(() => editor.setState({ attribution: null }))
    expect(screen.queryByTestId('last-change')).toBeNull()
  })
})
