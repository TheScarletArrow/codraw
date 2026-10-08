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
      'Копировать стиль',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Удалить',
    ])
    const anchor = screen.getByTestId('canvas-menu-anchor')
    expect([anchor.style.left, anchor.style.top]).toEqual(['100px', '50px'])
    expect(within(screen.getByRole('menu')).getAllByRole('separator')).toHaveLength(4)
  })

  it('wraps a message of a sequence diagram into a frame and copies the diagram as Mermaid', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.mocked(editor.sequenceMermaid).mockReturnValue('sequenceDiagram\n')
    rightClick('message')
    expect(screen.getByText('Рамка')).toBeVisible()
    await userEvent.click(screen.getByRole('menuitem', { name: 'loop — цикл' }))
    expect(editor.addSequenceFrame).toHaveBeenCalledWith('loop')

    rightClick('message')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить сообщение ниже' }))
    expect(editor.addSequenceMessage).toHaveBeenCalled()

    rightClick('sequence')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Скопировать Mermaid' }))
    expect(editor.sequenceMermaid).toHaveBeenCalledWith('cell-1')
    expect(writeText).toHaveBeenCalledWith('sequenceDiagram\n')
  })

  it('adds a branch to a selected frame that has branches', async () => {
    act(() =>
      editor.setState({
        sequence: {
          diagramId: 'd',
          numbered: false,
          participants: [],
          part: { type: 'frame', cellId: 'cell-1', kind: 'alt', frameId: 'cell-1' },
          rows: 1,
          canChange: true,
        },
      }),
    )
    rightClick('frame')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Добавить ветку' }))
    expect(editor.addSequenceBranch).toHaveBeenCalled()
  })

  it('shows the shortcut of an item', () => {
    rightClick('shape')

    const copy = screen.getByRole('menuitem', { name: 'Копировать' })
    expect(copy).toHaveTextContent('Ctrl+C')
    expect(copy).toHaveAttribute('aria-keyshortcuts', 'Control+C')
  })

  it('copies the look of an element and pastes it into the selection once it is copied', async () => {
    act(() => editor.setState({ canCopyStyle: true }))
    rightClick('shape')

    const copyStyle = screen.getByRole('menuitem', { name: 'Копировать стиль' })
    expect(copyStyle).toHaveTextContent('Ctrl+Alt+C')
    expect(copyStyle).toHaveAttribute('aria-keyshortcuts', 'Control+Alt+C')
    expect(screen.getByRole('menuitem', { name: 'Вставить стиль' })).toBeDisabled()
    await userEvent.click(copyStyle)
    expect(editor.copyStyle).toHaveBeenCalled()

    act(() => editor.setState({ canCopyStyle: false, canPasteStyle: true }))
    rightClick('selection')
    expect(screen.queryByRole('menuitem', { name: 'Копировать стиль' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Вставить стиль' }))
    expect(editor.pasteStyle).toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
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

    await waitFor(() => expect(editor.paste).toHaveBeenCalledWith({ x: 300, y: 200 }, 'Заметка', '', []))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('adds a sticky at the point of the click, whose text is edited at once', async () => {
    rightClick('canvas')
    const item = screen.getByRole('menuitem', { name: 'Добавить стикер' })
    expect(item).toHaveTextContent('N')

    await userEvent.click(item)

    expect(editor.addSticky).toHaveBeenCalledWith({ x: 300, y: 200 })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('pastes the clipboard of the tab when the browser does not let the page read the system clipboard', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'read').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    act(() => editor.setState({ canPaste: true }))
    rightClick('canvas')

    await user.click(screen.getByRole('menuitem', { name: 'Вставить' }))

    await waitFor(() => expect(editor.paste).toHaveBeenCalledWith({ x: 300, y: 200 }, undefined, undefined, undefined))
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
    expect(screen.getByRole('menuitem', { name: 'Вставить стиль' })).toBeDisabled()
    expect(screen.queryByRole('menuitem', { name: 'Закрепить' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Открепить' }))
    expect(editor.setLocked).toHaveBeenCalledWith(false)
  })

  describe('with statuses', () => {
    const onStatusChange = vi.fn()

    beforeEach(() => {
      document.body.innerHTML = ''
      onStatusChange.mockReset()
      editor = createFakeEditor()
      render(<CanvasMenu editor={editor} onStatusChange={onStatusChange} />)
    })

    it('offers the statuses with the current one chosen, and sets the chosen one', async () => {
      act(() => editor.setState({ status: { value: 'draft', mixed: false } }))
      vi.mocked(editor.setStatus).mockReturnValue(['cell-1'])
      rightClick('table')

      const statuses = within(screen.getByRole('menu')).getAllByRole('menuitemradio')
      expect(statuses.map((item) => [item.getAttribute('aria-label'), item.getAttribute('aria-checked')])).toEqual([
        ['Черновик', 'true'],
        ['Нужно ревью', 'false'],
        ['Готово', 'false'],
        ['Без статуса', 'false'],
      ])
      expect(within(screen.getByRole('menu')).getByText('Статус')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Нужно ревью' }))

      expect(editor.setStatus).toHaveBeenCalledWith('review')
      expect(onStatusChange).toHaveBeenCalledWith('review', ['cell-1'])
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('takes the status off, and tells nothing when no status changed', async () => {
      act(() => editor.setState({ status: { value: null, mixed: true } }))
      rightClick('selection')
      expect(screen.queryByRole('menuitemradio', { checked: true })).toBeNull()
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Без статуса' }))

      expect(editor.setStatus).toHaveBeenCalledWith(null)
      expect(onStatusChange).not.toHaveBeenCalled()
    })

    it('keeps the statuses of locked elements', () => {
      act(() =>
        editor.setState({
          status: { value: 'done', mixed: false },
          lock: { all: true, canLock: false, locks: [{ cellId: 'cell-1', lockedBy: 'Алиса' }] },
        }),
      )
      rightClick('shape')

      expect(screen.getByRole('menuitemradio', { name: 'Готово', checked: true })).toBeEnabled()
      expect(screen.getByRole('menuitemradio', { name: 'Черновик' })).toBeEnabled()
    })

    it('offers no statuses without elements that may have one', () => {
      rightClick('edge')

      expect(screen.queryByRole('menuitemradio')).toBeNull()
    })
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
        'Копировать стиль',
        'Вставить стиль',
        'Комментировать',
        'Удалить',
      ])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать' }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(onComment).toHaveBeenCalledWith({ cellId: 'edge-7' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(editor.focus).not.toHaveBeenCalled()
    })

    it('comments on the point of a click on the empty canvas, and leaves the keyboard to the field of the comment', async () => {
      rightClick('canvas')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать здесь' }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(onComment).toHaveBeenCalledWith({ point: { x: 300, y: 200 } })
      expect(editor.focus).not.toHaveBeenCalled()
    })

    it('does not comment on the canvas as on an element, nor on several elements', () => {
      rightClick('selection')
      expect(screen.queryByRole('menuitem', { name: /^Комментировать/ })).toBeNull()

      rightClick('canvas')
      expect(screen.queryByRole('menuitem', { name: 'Комментировать' })).toBeNull()
    })
  })

  describe('with links', () => {
    const onLink = vi.fn()

    beforeEach(() => {
      document.body.innerHTML = ''
      onLink.mockReset()
      editor = createFakeEditor()
      render(<CanvasMenu editor={editor} onLink={onLink} />)
    })

    it('opens the window of the link of a single element, and leaves the keyboard to it', async () => {
      act(() => editor.setState({ link: { cellId: 'cell-1', link: null, canChange: true } }))
      rightClick('shape')

      expect(items().map((item) => item.getAttribute('aria-label')).slice(-2)).toEqual(['Ссылка…', 'Удалить'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Ссылка…' }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(onLink).toHaveBeenCalledWith({ x: 100, y: 50, point: { x: 300, y: 200 }, target: 'shape', cellId: 'cell-1' })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(editor.focus).not.toHaveBeenCalled()
    })

    it('offers no link for an element that cannot have one, and a disabled one for a locked element', () => {
      act(() => editor.setState({ link: null }))
      rightClick('field')
      expect(screen.queryByRole('menuitem', { name: 'Ссылка…' })).toBeNull()

      act(() =>
        editor.setState({
          link: { cellId: 'cell-1', link: 'https://example.com', canChange: false },
          lock: { all: true, canLock: false, locks: [{ cellId: 'cell-1', lockedBy: 'Алиса' }] },
        }),
      )
      rightClick('shape')
      expect(screen.getByRole('menuitem', { name: 'Ссылка…' })).toBeDisabled()
    })
  })

  describe('with descriptions of calls', () => {
    const onEdgeApi = vi.fn()

    beforeEach(() => {
      document.body.innerHTML = ''
      onEdgeApi.mockReset()
      editor = createFakeEditor()
      render(<CanvasMenu editor={editor} onEdgeApi={onEdgeApi} />)
    })

    it('asks the page to edit the description of the call of a single edge, and leaves the keyboard to it', async () => {
      act(() => editor.setState({ edgeApi: { cellId: 'cell-1', api: null, canChange: true } }))
      rightClick('edge')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Описание API…' }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(onEdgeApi).toHaveBeenCalledWith('cell-1')
      expect(screen.queryByRole('menu')).toBeNull()
      expect(editor.focus).not.toHaveBeenCalled()
    })

    it('offers no description without a single edge', () => {
      act(() => editor.setState({ edgeApi: null }))
      rightClick('shape')
      expect(screen.queryByRole('menuitem', { name: 'Описание API…' })).toBeNull()
    })
  })

  describe('with properties', () => {
    const onProperties = vi.fn()
    const shapeProperties = {
      target: 'shape' as const,
      cellId: 'cell-1',
      properties: { name: 'API', kind: null, technology: '', description: '', owner: '', tags: [] },
      defaultKind: null,
      format: 'plain' as const,
      showTechnology: false,
      element: false,
      canChange: true,
    }

    beforeEach(() => {
      document.body.innerHTML = ''
      onProperties.mockReset()
    })

    it('asks the page to show the properties of a single shape, and leaves the keyboard to it', async () => {
      editor = createFakeEditor()
      render(<CanvasMenu editor={editor} onProperties={onProperties} />)
      act(() => editor.setState({ properties: shapeProperties }))
      rightClick('shape')

      await userEvent.click(screen.getByRole('menuitem', { name: 'Свойства…' }))
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

      expect(onProperties).toHaveBeenCalledWith('cell-1')
      expect(editor.focus).not.toHaveBeenCalled()
    })

    it('offers them to a participant who may only view, whose menu has nothing else for an edge', async () => {
      editor = createFakeEditor({ readOnly: true })
      render(<CanvasMenu editor={editor} onProperties={onProperties} />)
      act(() =>
        editor.setState({ properties: { target: 'edge', cellId: 'cell-1', properties: { technology: 'Kafka', interaction: 'async' }, canChange: false } }),
      )
      rightClick('edge')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать стиль', 'Свойства…'])
    })

    it('offers no properties of a shape that has none', () => {
      editor = createFakeEditor()
      render(<CanvasMenu editor={editor} onProperties={onProperties} />)
      act(() => editor.setState({ properties: null }))
      rightClick('shape')

      expect(screen.queryByRole('menuitem', { name: 'Свойства…' })).toBeNull()
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

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать', 'Копировать стиль'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Копировать' }))
      expect(editor.copy).toHaveBeenCalled()
    })

    it('offers no statuses', () => {
      act(() => editor.setState({ status: { value: 'review', mixed: false } }))
      rightClick('shape')

      expect(screen.queryByRole('menuitemradio')).toBeNull()
    })

    it('offers neither locking nor unlocking', () => {
      act(() => editor.setState({ lock: { all: true, canLock: false, locks: [{ cellId: 'cell-1', lockedBy: 'Алиса' }] } }))
      rightClick('shape')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать', 'Копировать стиль'])
      expect(screen.getByRole('menu')).not.toHaveAccessibleDescription()
    })

    it('offers copying the look of an edge, but not pasting one', async () => {
      act(() => editor.setState({ canCopyStyle: true }))
      rightClick('edge')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать стиль'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Копировать стиль' }))
      expect(editor.copyStyle).toHaveBeenCalled()
    })

    it('comments on an edge when the page takes comments', async () => {
      document.body.innerHTML = ''
      const onComment = vi.fn()
      render(<CanvasMenu editor={editor} onComment={onComment} />)
      rightClick('edge', 'edge-7')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Копировать стиль', 'Комментировать'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать' }))
      expect(onComment).toHaveBeenCalledWith({ cellId: 'edge-7' })
    })

    it('comments on a point of the empty canvas when the page takes comments', async () => {
      document.body.innerHTML = ''
      const onComment = vi.fn()
      render(<CanvasMenu editor={editor} onComment={onComment} />)
      rightClick('canvas')

      expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['Выделить всё', 'Комментировать здесь'])
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать здесь' }))
      expect(onComment).toHaveBeenCalledWith({ point: { x: 300, y: 200 } })
    })
  })
})
