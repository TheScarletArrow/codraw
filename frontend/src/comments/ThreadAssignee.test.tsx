import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Person } from '../api/comments.ts'
import { AssignButton, ThreadAssignee } from './ThreadAssignee.tsx'

const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const bob: Person = { id: 'bob', name: 'Боб', avatarUrl: 'https://avatars.example.com/bob.png' }
const boris: Person = { id: 'boris', name: 'Борис Петров', avatarUrl: null }
const people = [alice, bob, boris]

const picker = () => within(screen.getByRole('dialog', { name: 'Назначить ответственного' }))

describe('AssignButton', () => {
  it('assigns the thread to a participant found by the first letters of their name', async () => {
    const onAssign = vi.fn(() => Promise.resolve())
    render(<AssignButton people={people} onAssign={onAssign} />)

    await userEvent.click(screen.getByRole('button', { name: 'Назначить' }))
    expect(picker().getAllByRole('button')).toHaveLength(3)
    for (const person of people) expect(picker().getByRole('button', { name: person.name })).toBeInTheDocument()

    await userEvent.type(picker().getByRole('searchbox', { name: 'Найти участника' }), 'пет')
    expect(picker().getAllByRole('button')).toHaveLength(1)
    await userEvent.click(picker().getByRole('button', { name: 'Борис Петров' }))

    expect(onAssign).toHaveBeenCalledWith(boris)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Назначить ответственного' })).toBeNull())
  })

  it('assigns the first one found with Enter, and says when nobody is found', async () => {
    const onAssign = vi.fn(() => Promise.resolve())
    render(<AssignButton people={people} onAssign={onAssign} />)
    await userEvent.click(screen.getByRole('button', { name: 'Назначить' }))

    await userEvent.type(picker().getByRole('searchbox', { name: 'Найти участника' }), 'я')
    expect(picker().getByText('Никого не нашлось')).toBeInTheDocument()
    await userEvent.clear(picker().getByRole('searchbox', { name: 'Найти участника' }))
    await userEvent.type(picker().getByRole('searchbox', { name: 'Найти участника' }), 'б{Enter}')

    expect(onAssign).toHaveBeenCalledWith(bob)
  })
})

describe('ThreadAssignee', () => {
  it('shows the assignee, whose name assigns another, and «Снять»', async () => {
    const onAssign = vi.fn(() => Promise.resolve())
    render(<ThreadAssignee assignee={bob} people={people} onAssign={onAssign} />)

    const name = screen.getByRole('button', { name: 'Боб' })
    expect(name).toHaveAccessibleDescription('Назначить другого')
    expect(within(name).getByRole('presentation')).toHaveAttribute('src', 'https://avatars.example.com/bob.png')
    await userEvent.click(name)
    expect(picker().getByRole('button', { name: 'Боб' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(picker().getByRole('button', { name: 'Алиса' }))
    expect(onAssign).toHaveBeenLastCalledWith(alice)

    await userEvent.click(screen.getByRole('button', { name: 'Снять' }))
    expect(onAssign).toHaveBeenLastCalledWith(null)
  })

  it('changes nothing when the assignee is chosen again', async () => {
    const onAssign = vi.fn(() => Promise.resolve())
    render(<ThreadAssignee assignee={bob} people={people} onAssign={onAssign} />)

    await userEvent.click(screen.getByRole('button', { name: 'Боб' }))
    await userEvent.click(picker().getByRole('button', { name: 'Боб' }))

    expect(onAssign).not.toHaveBeenCalled()
  })
})
