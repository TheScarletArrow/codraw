import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  const rightClick = (target: MenuTarget, cellId: string | null = target === 'canvas' || target === 'selection' ? null : 'cell-1') =>
    act(() => editor.rightClick({ x: 100, y: 50, point: { x: 300, y: 200 }, target, cellId }))
  const items = () => within(screen.getByRole('menu')).getAllByRole('menuitem')

  it('is closed until the canvas is right-clicked', () => {
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens at the point of the click with the items of the target', () => {
    rightClick('table')

    expect(items().map((item) => item.getAttribute('aria-label') ?? item.textContent)).toEqual([
      'Изменить подпись',
      'Добавить поле',
      'Добавить индекс',
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

  it('pastes the system clipboard at the point of the click, closes and gives the keyboard back to the canvas', async () => {
    // user-event puts its own clipboard into jsdom, which has none.
    const user = userEvent.setup()
    await navigator.clipboard.writeText('Заметка')
    act(() => editor.setState({ canPaste: true }))
    rightClick('canvas')

    await user.click(screen.getByRole('menuitem', { name: 'Вставить' }))

    await waitFor(() => expect(editor.paste).toHaveBeenCalledWith({ x: 300, y: 200 }, 'Заметка', ''))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('pastes the clipboard of the tab when the browser does not let the page read the system clipboard', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'read').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    act(() => editor.setState({ canPaste: true }))
    rightClick('canvas')

    await user.click(screen.getByRole('menuitem', { name: 'Вставить' }))

    await waitFor(() => expect(editor.paste).toHaveBeenCalledWith({ x: 300, y: 200 }, undefined, undefined))
    vi.restoreAllMocks()
  })

  it('runs the command of the chosen item', async () => {
    rightClick('edge')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Развернуть направление' }))
    rightClick('field')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить поле ниже' }))
    rightClick('index')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить индекс ниже' }))
    rightClick('selection')
    await userEvent.click(screen.getByRole('menuitem', { name: 'На задний план' }))

    expect(editor.reverseEdge).toHaveBeenCalled()
    expect(editor.addTableField).toHaveBeenCalled()
    expect(editor.addTableIndex).toHaveBeenCalled()
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

  it('groups the selection and ungroups a group', async () => {
    act(() => editor.setState({ canGroup: true }))
    rightClick('selection')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Сгруппировать' }))
    expect(editor.group).toHaveBeenCalled()

    rightClick('group')
    expect(screen.getByRole('menuitem', { name: 'Разгруппировать' })).toHaveTextContent('Ctrl+Shift+G')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Разгруппировать' }))
    expect(editor.ungroup).toHaveBeenCalled()
  })

  it('locks the selection, and unlocks it with the name of who locked it over the disabled items', async () => {
    act(() => editor.setState({ lock: { all: false, canLock: true, locks: [] } }))
    rightClick('shape')
    expect(screen.queryByRole('menuitem', { name: 'Открепить' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Закрепить' }))
    expect(editor.setLocked).toHaveBeenCalledWith(true)

    act(() => editor.setState({ lock: { all: true, canLock: false, locks: [{ cellId: 'cell-1', lockedBy: 'Алиса' }] } }))
    rightClick('shape')
    expect(screen.getByRole('menu')).toHaveAccessibleDescription('Закреплено: Алиса')
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Изменить подпись' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Копировать' })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: 'Закрепить' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Открепить' }))
    expect(editor.setLocked).toHaveBeenCalledWith(false)
  })

  describe('with comments', () => {
    const onComment = vi.fn()

    beforeEach(() => {
      document.body.innerHTML = ''
      onComment.mockReset()
      editor = createFakeEditor()
      render(<CanvasMenu editor={editor} onComment={onComment} />)
    })

    it('comments on a single element, and leaves the keyboard to the field of the comment', async () => {
      rightClick('edge', 'edge-7')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual([
        'Изменить подпись',
        'Развернуть направление',
        'Комментировать',
        'Удалить',
      ])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать' }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(onComment).toHaveBeenCalledWith('edge-7')
      expect(screen.queryByRole('menu')).toBeNull()
      expect(editor.focus).not.toHaveBeenCalled()
    })

    it('does not comment on the canvas or on several elements', () => {
      rightClick('selection')
      expect(screen.queryByRole('menuitem', { name: 'Комментировать' })).toBeNull()

      rightClick('canvas')
      expect(screen.queryByRole('menuitem', { name: 'Комментировать' })).toBeNull()
    })
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

    it('offers neither locking nor unlocking', () => {
      act(() => editor.setState({ lock: { all: true, canLock: false, locks: [{ cellId: 'cell-1', lockedBy: 'Алиса' }] } }))
      rightClick('shape')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать'])
      expect(screen.getByRole('menu')).not.toHaveAccessibleDescription()
    })

    it('does not open for an edge, which they cannot do anything with', () => {
      rightClick('edge')

      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('comments on an edge when the page takes comments', async () => {
      document.body.innerHTML = ''
      const onComment = vi.fn()
      render(<CanvasMenu editor={editor} onComment={onComment} />)
      rightClick('edge', 'edge-7')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Комментировать'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать' }))
      expect(onComment).toHaveBeenCalledWith('edge-7')
    })
  })
})
