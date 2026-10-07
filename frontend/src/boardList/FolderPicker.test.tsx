import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FolderPicker } from './FolderPicker.tsx'

const folders = [
  { id: 'work', name: 'Работа' },
  { id: 'home', name: 'Дом' },
]

describe('FolderPicker', () => {
  it('lists «Без папки» and the folders by name, with the folder of the board checked', () => {
    render(<FolderPicker title="Схема" folders={folders} current="work" onMove={vi.fn()} onCreate={vi.fn()} />)

    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent)).toEqual(['Без папки', 'Дом', 'Работа'])
    expect(screen.getByRole('menuitemradio', { name: 'Работа' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Без папки' })).toHaveAttribute('aria-checked', 'false')
  })

  it('takes a board out of its folder', async () => {
    const onMove = vi.fn()
    render(<FolderPicker title="Схема" folders={folders} current="work" onMove={onMove} onCreate={vi.fn()} />)

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Без папки' }))

    expect(onMove).toHaveBeenCalledWith(null)
  })

  it('creates a folder of a new name, and puts the board into the folder of a name the user has', async () => {
    const onMove = vi.fn()
    const onCreate = vi.fn()
    render(<FolderPicker title="Схема" folders={folders} current={null} onMove={onMove} onCreate={onCreate} />)
    const field = screen.getByRole('textbox', { name: 'Новая папка' })

    await userEvent.type(field, '  Идеи  {Enter}')
    await userEvent.type(field, 'работа{Enter}')
    await userEvent.type(field, '   {Enter}')

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Идеи')
    expect(onMove).toHaveBeenCalledExactlyOnceWith('work')
  })
})
