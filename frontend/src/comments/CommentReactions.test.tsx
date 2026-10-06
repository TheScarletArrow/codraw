import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CommentReaction, Person } from '../api/comments.ts'
import { CommentReactions } from './CommentReactions.tsx'

const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const bob: Person = { id: 'bob', name: 'Боб', avatarUrl: null }

function renderReactions(reactions: CommentReaction[]) {
  const onToggle = vi.fn(() => Promise.resolve())
  render(<CommentReactions reactions={reactions} userId="alice" onToggle={onToggle} />)
  return onToggle
}

const reactions = () => within(screen.getByRole('group', { name: 'Реакции' }))

describe('CommentReactions', () => {
  it('shows a chip for each reaction put, with how many put it, pressed when the user did, naming them', () => {
    renderReactions([
      { reaction: 'thumbs-up', people: [bob, alice] },
      { reaction: 'eyes', people: [bob] },
    ])

    const thumbsUp = reactions().getByRole('button', { name: '👍 2' })
    expect(thumbsUp).toHaveAttribute('aria-pressed', 'true')
    expect(thumbsUp).toHaveAttribute('title', 'Боб, Алиса')
    const eyes = reactions().getByRole('button', { name: '👀 1' })
    expect(eyes).toHaveAttribute('aria-pressed', 'false')
    expect(eyes).toHaveAccessibleDescription('Боб')
  })

  it('takes the reaction of the user away or puts it with a click on its chip', async () => {
    const onToggle = renderReactions([
      { reaction: 'thumbs-up', people: [alice] },
      { reaction: 'heart', people: [bob] },
    ])

    await userEvent.click(reactions().getByRole('button', { name: '👍 1' }))
    expect(onToggle).toHaveBeenLastCalledWith('thumbs-up', false)

    await userEvent.click(reactions().getByRole('button', { name: '❤️ 1' }))
    expect(onToggle).toHaveBeenLastCalledWith('heart', true)
  })

  it('offers the whole set, where a click puts the reaction or takes away the one the user put', async () => {
    const onToggle = renderReactions([{ reaction: 'check', people: [alice] }])

    await userEvent.click(screen.getByRole('button', { name: 'Добавить реакцию' }))
    const set = within(screen.getByRole('dialog', { name: 'Набор реакций' }))
    expect(set.getAllByRole('button').map((button) => button.textContent)).toEqual(['👍', '❤️', '🎉', '😄', '👀', '✅'])
    expect(set.getByRole('button', { name: '🎉' })).toHaveAccessibleDescription('Праздник')
    expect(set.getByRole('button', { name: '✅' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(set.getByRole('button', { name: '🎉' }))
    expect(onToggle).toHaveBeenLastCalledWith('party', true)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Набор реакций' })).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Добавить реакцию' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Набор реакций' })).getByRole('button', { name: '✅' }))
    expect(onToggle).toHaveBeenLastCalledWith('check', false)
  })

  it('shows only «Добавить реакцию» while nobody reacted', () => {
    renderReactions([])

    expect(reactions().getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Добавить реакцию'])
  })
})
