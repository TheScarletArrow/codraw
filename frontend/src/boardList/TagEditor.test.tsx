import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TagEditor } from './TagEditor.tsx'

describe('TagEditor', () => {
  it('adds a typed tag on Enter, trimmed, and empties the field', async () => {
    const onChange = vi.fn()
    render(<TagEditor title="Схема" tags={['Бэкенд']} known={['Бэкенд']} onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'Новый тег' })

    expect(field).toHaveFocus()
    await userEvent.type(field, '  Два   слова {Enter}')

    expect(onChange).toHaveBeenCalledWith(['Бэкенд', 'Два слова'])
    expect(field).toHaveValue('')
  })

  it('adds no blank tag and no tag the board has in any case', async () => {
    const onChange = vi.fn()
    render(<TagEditor title="Схема" tags={['Бэкенд']} known={['Бэкенд']} onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'Новый тег' })

    await userEvent.type(field, '   {Enter}')
    await userEvent.type(field, 'бэкенд{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('writes a tag the user has as they wrote it, and suggests it', async () => {
    const onChange = vi.fn()
    render(<TagEditor title="Схема" tags={[]} known={['API', 'Архив']} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Новый тег' }), 'a')
    const suggestions = screen.getByRole('group', { name: 'Подсказки тегов' })
    expect(within(suggestions).getAllByRole('button').map((button) => button.textContent)).toEqual(['API'])
    await userEvent.type(screen.getByRole('textbox', { name: 'Новый тег' }), 'pi{Enter}')

    expect(onChange).toHaveBeenCalledWith(['API'])
  })

  it('removes a tag and shows why a change did not happen', async () => {
    const onChange = vi.fn()
    render(<TagEditor title="Схема" tags={['A', 'B']} known={['A', 'B']} onChange={onChange} error="Не удалось изменить теги" />)

    await userEvent.click(screen.getByRole('button', { name: 'Убрать тег «A»' }))

    expect(onChange).toHaveBeenCalledWith(['B'])
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось изменить теги')
  })
})
