import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ShortcutsHelp } from './ShortcutsHelp.tsx'

describe('ShortcutsHelp', () => {
  it('opens with its button and lists the shortcuts by groups', async () => {
    render(<ShortcutsHelp isMac={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Горячие клавиши' }))

    const help = screen.getByRole('dialog', { name: 'Горячие клавиши' })
    const editing = within(help).getByRole('region', { name: 'Правка' })
    expect(within(editing).getByText('Дублировать').nextElementSibling).toHaveTextContent('Ctrl+D')
    const view = within(help).getByRole('region', { name: 'Вид' })
    expect(within(view).getByText('Показать всё').nextElementSibling).toHaveTextContent('Ctrl+Shift+H')
    const together = within(help).getByRole('region', { name: 'Совместная работа' })
    expect(within(together).getByText('Указка').nextElementSibling).toHaveTextContent('K')
    expect(within(together).getByText('Комментарий').nextElementSibling).toHaveTextContent('C')
    expect(within(together).getByText('Сообщение у курсора').nextElementSibling).toHaveTextContent('/')
  })

  it('opens and closes with ?, which is a character in fields and labels', () => {
    render(<ShortcutsHelp isMac />)

    fireEvent.keyDown(document.body, { key: '?' })
    const help = screen.getByRole('dialog', { name: 'Горячие клавиши' })
    expect(within(help).getByText('Дублировать').nextElementSibling).toHaveTextContent('⌘D')
    fireEvent.keyDown(document.body, { key: '?' })
    expect(screen.queryByRole('dialog')).toBeNull()

    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: '?' })
    const label = document.createElement('div')
    label.setAttribute('contenteditable', 'true')
    document.body.append(label)
    fireEvent.keyDown(label, { key: '?' })
    expect(screen.queryByRole('dialog')).toBeNull()
    input.remove()
    label.remove()
  })

  it('shows a participant who may only view only the shortcuts they have', async () => {
    render(<ShortcutsHelp readOnly isMac={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Горячие клавиши' }))

    const help = screen.getByRole('dialog', { name: 'Горячие клавиши' })
    expect(within(help).getByText('Копировать')).toBeInTheDocument()
    expect(within(help).getByText('Указка')).toBeInTheDocument()
    expect(within(help).getByText('Комментарий')).toBeInTheDocument()
    expect(within(help).queryByText('Удалить')).toBeNull()
  })
})
