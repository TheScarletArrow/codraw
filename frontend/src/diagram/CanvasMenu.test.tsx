import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { CanvasMenu } from './CanvasMenu.tsx'
import type { MenuTarget } from './canvasMenu.ts'

describe('CanvasMenu', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor()
    render(<CanvasMenu editor={editor} />)
  })

  const rightClick = (target: MenuTarget) =>
    act(() => editor.rightClick({ x: 100, y: 50, point: { x: 300, y: 200 }, target }))
  const items = () => within(screen.getByRole('menu')).getAllByRole('menuitem')

  it('is closed until the canvas is right-clicked', () => {
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens at the point of the click with the items of the target', () => {
    rightClick('table')

    expect(items().map((item) => item.getAttribute('aria-label') ?? item.textContent)).toEqual([
      'Изменить подпись',
      'Добавить поле',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'На передний план',
      'На задний план',
      'Удалить',
    ])
    const anchor = screen.getByTestId('canvas-menu-anchor')
    expect([anchor.style.left, anchor.style.top]).toEqual(['100px', '50px'])
    expect(within(screen.getByRole('menu')).getAllByRole('separator')).toHaveLength(3)
  })

  it('shows the shortcut of an item', () => {
    rightClick('shape')

    const copy = screen.getByRole('menuitem', { name: 'Копировать' })
    expect(copy).toHaveTextContent('Ctrl+C')
    expect(copy).toHaveAttribute('aria-keyshortcuts', 'Control+C')
  })

  it('disables paste while the clipboard is empty', () => {
    rightClick('canvas')
    expect(screen.getByRole('menuitem', { name: 'Вставить' })).toBeDisabled()

    act(() => editor.setState({ canPaste: true }))

    expect(screen.getByRole('menuitem', { name: 'Вставить' })).toBeEnabled()
  })

  it('pastes at the point of the click, closes and gives the keyboard back to the canvas', async () => {
    act(() => editor.setState({ canPaste: true }))
    rightClick('canvas')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Вставить' }))

    expect(editor.paste).toHaveBeenCalledWith({ x: 300, y: 200 })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('runs the command of the chosen item', async () => {
    rightClick('edge')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Развернуть направление' }))
    rightClick('field')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить поле ниже' }))
    rightClick('selection')
    await userEvent.click(screen.getByRole('menuitem', { name: 'На задний план' }))

    expect(editor.reverseEdge).toHaveBeenCalled()
    expect(editor.addTableField).toHaveBeenCalled()
    expect(editor.sendToBack).toHaveBeenCalled()
  })

  it('stays open when the canvas is right-clicked again right after the previous menu was closed', async () => {
    const canvas = document.createElement('div')
    canvas.tabIndex = 0
    document.body.append(canvas)
    vi.mocked(editor.focus).mockImplementation(() => canvas.focus())
    rightClick('field')

    // Escape and the next right click come one after the other, before the timeout of the closed menu.
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    })
    rightClick('canvas')
    // The previous menu gives the keyboard back to the canvas after it is gone, on a timeout.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(items()[0]).toHaveAttribute('aria-label', 'Вставить')
    canvas.remove()
  })

  it('closes with Escape without running a command', async () => {
    rightClick('shape')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(editor.deleteSelection).not.toHaveBeenCalled()
  })

  describe('for a participant who may only view', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
      editor = createFakeEditor({ readOnly: true })
      render(<CanvasMenu editor={editor} />)
    })

    it('offers copying a shape', async () => {
      rightClick('shape')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Копировать' }))
      expect(editor.copy).toHaveBeenCalled()
    })

    it('does not open for an edge, which they cannot do anything with', () => {
      rightClick('edge')

      expect(screen.queryByRole('menu')).toBeNull()
    })
  })
})
