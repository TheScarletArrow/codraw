import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Person } from '../api/comments.ts'
import { CommentComposer } from './CommentComposer.tsx'

const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const bob: Person = { id: 'bob', name: 'Боб', avatarUrl: null }
const boris: Person = { id: 'boris', name: 'Борис', avatarUrl: null }

function renderComposer(props: Partial<Parameters<typeof CommentComposer>[0]> = {}) {
  const onSubmit = vi.fn(() => Promise.resolve())
  render(
    <CommentComposer
      people={[alice, bob, boris]}
      label="Комментарий"
      placeholder="Комментарий"
      submitLabel="Отправить"
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, field: screen.getByRole('combobox', { name: 'Комментарий' }) }
}

describe('CommentComposer', () => {
  it('sends the text without the blanks around it with Enter and empties the field', async () => {
    const { onSubmit, field } = renderComposer()

    await userEvent.type(field, '  Почему без кэша?  {Enter}')

    expect(onSubmit).toHaveBeenCalledWith({ body: 'Почему без кэша?', mentions: [] })
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('starts a new line with Shift+Enter and sends with the button', async () => {
    const { onSubmit, field } = renderComposer()

    await userEvent.type(field, 'Первая{Shift>}{Enter}{/Shift}вторая')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(onSubmit).toHaveBeenCalledWith({ body: 'Первая\nвторая', mentions: [] })
  })

  it('sends nothing blank', async () => {
    const { onSubmit, field } = renderComposer()

    await userEvent.type(field, '   {Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  })

  it('offers the participants after @ and mentions the chosen one', async () => {
    const { onSubmit, field } = renderComposer()

    await userEvent.type(field, 'Посмотри, @Бо')
    const options = within(screen.getByRole('listbox', { name: 'Кого упомянуть' })).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Боб', 'Борис'])
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(field).toHaveValue('Посмотри, @Борис ')
    expect(screen.queryByRole('listbox')).toBeNull()

    await userEvent.type(field, 'пожалуйста{Enter}')
    expect(onSubmit).toHaveBeenCalledWith({ body: 'Посмотри, @Борис пожалуйста', mentions: ['boris'] })
  })

  it('mentions a participant chosen with the mouse', async () => {
    const { onSubmit, field } = renderComposer()

    await userEvent.type(field, '@')
    await userEvent.click(screen.getByRole('option', { name: 'Алиса' }))
    await userEvent.type(field, 'привет{Enter}')

    expect(onSubmit).toHaveBeenCalledWith({ body: '@Алиса привет', mentions: ['alice'] })
  })

  it('drops a mention whose @Name was erased from the text', async () => {
    const { onSubmit, field } = renderComposer()

    await userEvent.type(field, '@Бо{Enter}')
    await userEvent.clear(field)
    await userEvent.type(field, 'Без упоминаний{Enter}')

    expect(onSubmit).toHaveBeenCalledWith({ body: 'Без упоминаний', mentions: [] })
  })

  it('closes the suggestions with Escape and then cancels', async () => {
    const onCancel = vi.fn()
    const { field } = renderComposer({ onCancel })

    await userEvent.type(field, '@')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('keeps the mentions of a comment being changed', async () => {
    const { onSubmit, field } = renderComposer({ initialText: '@Боб глянь', initialMentions: [bob] })

    await userEvent.type(field, ' ещё раз{Enter}')

    expect(onSubmit).toHaveBeenCalledWith({ body: '@Боб глянь ещё раз', mentions: ['bob'] })
  })

  it('keeps the text when sending fails', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('offline')))
    const { field } = renderComposer({ onSubmit, error: 'Не удалось отправить комментарий' })

    await userEvent.type(field, 'Важное{Enter}')

    expect(onSubmit).toHaveBeenCalled()
    expect(field).toHaveValue('Важное')
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить комментарий')
  })
})
