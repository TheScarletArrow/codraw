import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { AutoLayoutPicker } from './AutoLayoutPicker.tsx'

describe('AutoLayoutPicker', () => {
  it('lays out the whole page without a selection, left to right or top to bottom', async () => {
    const editor = createFakeEditor()
    act(() => editor.setState({ hasCells: true }))
    render(<AutoLayoutPicker editor={editor} isMac={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Автораскладка' }))
    const picker = screen.getByRole('dialog', { name: 'Автораскладка' })
    expect(picker).toHaveTextContent('Разложить всю страницу')
    expect(picker).toHaveTextContent('Ctrl+Shift+L')
    await userEvent.click(screen.getByRole('button', { name: /Сверху вниз/ }))

    expect(editor.autoLayout).toHaveBeenCalledWith('down')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says that it lays out the selection, and shows the shortcut of macOS', async () => {
    const editor = createFakeEditor()
    act(() => editor.setState({ hasCells: true, layoutSelection: true }))
    render(<AutoLayoutPicker editor={editor} isMac />)

    await userEvent.click(screen.getByRole('button', { name: 'Автораскладка' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Разложить выделенное')
    expect(screen.getByRole('dialog')).toHaveTextContent('⇧⌘L')
    await userEvent.click(screen.getByRole('button', { name: /Слева направо/ }))

    expect(editor.autoLayout).toHaveBeenCalledWith('right')
  })

  it('is disabled on an empty page and while a layout runs', async () => {
    const editor = createFakeEditor()
    render(<AutoLayoutPicker editor={editor} />)
    expect(screen.getByRole('button', { name: 'Автораскладка' })).toBeDisabled()

    let finish = () => {}
    vi.mocked(editor.autoLayout).mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    act(() => editor.setState({ hasCells: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Автораскладка' }))
    await userEvent.click(screen.getByRole('button', { name: /Слева направо/ }))

    expect(screen.getByRole('button', { name: 'Автораскладка' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Автораскладка' })).toHaveTextContent('Раскладка…')
    await act(async () => finish())
    expect(screen.getByRole('button', { name: 'Автораскладка' })).toBeEnabled()
  })
})
