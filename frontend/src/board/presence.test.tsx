import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FakeAwareness } from '../test/fakeProvider.ts'
import { PresenceLayer } from './PresenceLayer.tsx'
import { CURSOR_INTERVAL_MS, readRemotePresence, usePresencePublisher, VIEW_INTERVAL_MS, type Awareness } from './presence.ts'

const asAwareness = (awareness: FakeAwareness) => awareness as unknown as Awareness
const bob = { name: 'Боб', color: '#dc2626', avatarUrl: 'https://avatars.example.com/bob.png' }

describe('usePresencePublisher', () => {
  let editor: FakeEditor
  let awareness: FakeAwareness
  const local = () => awareness.getStates().get(awareness.clientID) ?? {}

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    editor = createFakeEditor()
    awareness = new FakeAwareness(1)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes the pointer position in diagram coordinates', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))

    editor.movePointer({ x: 120.4, y: 80.6 })

    expect(local().cursor).toEqual({ x: 120, y: 81 })
  })

  it('sends at most one update per interval and then the latest position', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))
    const updates: unknown[] = []
    awareness.on('change', () => updates.push(local().cursor))

    editor.movePointer({ x: 1, y: 1 })
    editor.movePointer({ x: 2, y: 2 })
    editor.movePointer({ x: 3, y: 3 })
    expect(updates).toEqual([{ x: 1, y: 1 }])

    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(updates).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 3 },
    ])
  })

  it('never sends an older position after a newer one when the timer of the interval fires late', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))
    const now = vi.spyOn(performance, 'now')

    now.mockReturnValue(0)
    editor.movePointer({ x: 1, y: 1 })
    now.mockReturnValue(10)
    editor.movePointer({ x: 2, y: 2 })
    // A busy page runs the timer of the interval late: the next move is past the interval already.
    now.mockReturnValue(60)
    editor.movePointer({ x: 3, y: 3 })
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)

    expect(local().cursor).toEqual({ x: 3, y: 3 })
    now.mockRestore()
  })

  it('clears the cursor when the pointer leaves the canvas', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))
    editor.movePointer({ x: 1, y: 1 })
    editor.movePointer({ x: 2, y: 2 })

    editor.movePointer(null)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)

    expect(local().cursor).toBeNull()
  })

  it('publishes the page of the editor', () => {
    editor = createFakeEditor({ pageId: 'p2' })
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))

    expect(local().page).toBe('p2')
  })

  it('publishes the selection', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))

    editor.select(['a', 'b'])

    expect(local().selection).toEqual(['a', 'b'])
  })

  it('clears cursor, selection, view and the label being edited when the editor goes away', () => {
    const { unmount } = renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))
    editor.movePointer({ x: 1, y: 1 })
    editor.select(['a'])
    editor.edit({ cellId: 'a', changedRemotely: false })

    unmount()

    expect(local()).toMatchObject({ cursor: null, selection: [], viewport: null, editing: null })
  })

  it('publishes the cell whose label is edited in place when editing starts and clears it when it stops', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))
    const updates: unknown[] = []
    awareness.on('change', () => updates.push(local().editing))

    editor.edit({ cellId: 'box', changedRemotely: false })
    // Another participant changing the label is the same editing.
    editor.edit({ cellId: 'box', changedRemotely: true })
    editor.edit(null)

    expect(updates).toEqual(['box', null])
  })

  it('publishes the label already being edited when the presence connects', () => {
    editor.edit({ cellId: 'box', changedRemotely: false })

    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))

    expect(local().editing).toBe('box')
  })

  it('publishes no editing for a participant who may only view the page', () => {
    editor = createFakeEditor({ readOnly: true })
    const { unmount } = renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))

    editor.edit({ cellId: 'box', changedRemotely: false })
    unmount()

    expect(local()).not.toHaveProperty('editing')
  })

  it('reads the label others edit and ignores what is not the id of a cell', () => {
    const others = new FakeAwareness(1)
    others.setState(2, { user: bob, editing: 'box' })
    others.setState(3, { user: { ...bob, name: 'Вера' }, editing: 42 })
    others.setState(4, { user: { ...bob, name: 'Гена' }, editing: '' })
    others.setState(5, { user: { ...bob, name: 'Старый' } })

    expect(readRemotePresence(asAwareness(others)).map((participant) => participant.editing)).toEqual([
      'box',
      null,
      null,
      null,
    ])
  })

  it('publishes the middle of the visible area and the scale at once and at most once per interval after', () => {
    renderHook(() => usePresencePublisher(editor, asAwareness(awareness)))
    expect(local().viewport).toEqual({ x: 400, y: 300, scale: 1 })

    editor.scrollTo({ x: 100.4, y: 50 })
    editor.zoomTo(1.5)
    expect(local().viewport).toEqual({ x: 400, y: 300, scale: 1 })

    vi.advanceTimersByTime(VIEW_INTERVAL_MS)
    expect(local().viewport).toEqual({ x: 500, y: 350, scale: 1.5 })
  })

  it('reads the view of others and ignores a view that is not one', () => {
    const others = new FakeAwareness(1)
    others.setState(2, { user: bob, viewport: { x: 10, y: 20, scale: 2 } })
    others.setState(3, { user: { ...bob, name: 'Вера' }, viewport: { x: 'a', y: 0, scale: 1 } })
    others.setState(4, { user: { ...bob, name: 'Гена' } })

    expect(readRemotePresence(asAwareness(others)).map((participant) => participant.viewport)).toEqual([
      { x: 10, y: 20, scale: 2 },
      null,
      null,
    ])
  })
})

describe('PresenceLayer', () => {
  let editor: FakeEditor
  let awareness: FakeAwareness

  beforeEach(() => {
    editor = createFakeEditor()
    awareness = new FakeAwareness(1)
    awareness.setLocalStateField('user', { name: 'Алиса', color: '#2563eb', avatarUrl: null })
  })

  const renderLayer = () => render(<PresenceLayer editor={editor} awareness={asAwareness(awareness)} />)

  it('shows the cursors of other participants with their names and avatars at their diagram position', () => {
    awareness.setLocalStateField('cursor', { x: 5, y: 5 })
    awareness.setState(7, { user: bob, cursor: { x: 200, y: 150 } })

    renderLayer()

    const cursors = screen.getAllByTestId('remote-cursor')
    expect(cursors).toHaveLength(1)
    expect(cursors[0]).toHaveTextContent('Боб')
    expect(cursors[0]!.querySelector('img')).toHaveAttribute('src', bob.avatarUrl)
    expect(cursors[0]!.style.transform).toBe('translate(200px, 150px)')
  })

  it('moves cursors with scrolling and removes them when the participant leaves the canvas', () => {
    awareness.setState(7, { user: bob, cursor: { x: 200, y: 150 } })
    renderLayer()

    act(() => editor.scrollTo({ x: 50, y: 30 }))
    expect(screen.getByTestId('remote-cursor').style.transform).toBe('translate(150px, 120px)')

    act(() => awareness.setState(7, { user: bob, cursor: null }))
    expect(screen.queryByTestId('remote-cursor')).toBeNull()
  })

  it('outlines cells selected by other participants in their color', () => {
    editor.placeCell('box', { x: 100, y: 50, width: 120, height: 60 })
    awareness.setLocalStateField('selection', ['box'])
    awareness.setState(7, { user: bob, selection: ['box', 'deleted'] })

    renderLayer()

    const outlines = screen.getAllByTestId('remote-selection')
    expect(outlines).toHaveLength(1)
    expect(outlines[0]).toHaveAttribute('data-participant', 'Боб')
    expect(outlines[0]).toHaveStyle({ left: '97px', top: '47px', width: '126px', height: '66px' })
    expect(outlines[0]!.style.borderColor).toBe('rgb(220, 38, 38)')
  })

  it('follows a selected cell when it moves', () => {
    editor.placeCell('box', { x: 100, y: 50, width: 120, height: 60 })
    awareness.setState(7, { user: bob, selection: ['box'] })
    renderLayer()

    act(() => editor.placeCell('box', { x: 300, y: 250, width: 120, height: 60 }))

    expect(screen.getByTestId('remote-selection')).toHaveStyle({ left: '297px', top: '247px' })
  })

  it('shows only the cursors and selections of participants on the same page', () => {
    editor = createFakeEditor({ pageId: 'p2' })
    editor.placeCell('box', { x: 100, y: 50, width: 120, height: 60 })
    awareness.setState(7, { user: bob, page: 'p2', cursor: { x: 200, y: 150 }, selection: ['box'] })
    awareness.setState(8, { user: { ...bob, name: 'Ева' }, page: 'p3', cursor: { x: 300, y: 150 }, selection: ['box'] })
    // A client that does not publish its page works on the default page.
    awareness.setState(9, { user: { ...bob, name: 'Старый' }, cursor: { x: 400, y: 150 }, selection: ['box'] })

    renderLayer()

    expect(screen.getAllByTestId('remote-cursor').map((cursor) => cursor.textContent)).toEqual(['Боб'])
    expect(screen.getAllByTestId('remote-selection').map((outline) => outline.dataset.participant)).toEqual(['Боб'])
  })

  describe('labels being edited', () => {
    const vera = { name: 'Вера', color: '#16a34a', avatarUrl: null }
    const tags = () => screen.queryAllByTestId('remote-editing-tag').map((tag) => tag.textContent)

    beforeEach(() => {
      editor.placeCell('box', { x: 100, y: 200, width: 120, height: 60 })
    })

    it('outlines a cell whose label another participant edits in their color, with a tag above it', () => {
      awareness.setState(7, { user: bob, editing: 'box', selection: ['box'] })

      renderLayer()

      const outline = screen.getByTestId('remote-editing')
      expect(outline).toHaveAttribute('data-participant', 'Боб')
      expect(outline).toHaveStyle({ left: '97px', top: '197px', width: '126px', height: '66px' })
      expect(outline.style.borderColor).toBe('rgb(220, 38, 38)')
      // The outline of the label being edited stands for the selection of the cell.
      expect(screen.queryByTestId('remote-selection')).toBeNull()
      const tag = screen.getByTestId('remote-editing-tag')
      expect(tag).toHaveTextContent('Боб редактирует')
      expect(tag.parentElement).toHaveStyle({ left: '97px', top: '193px', transform: 'translateY(-100%)' })
    })

    it('follows the cell when the canvas scrolls and drops the tag when the editing stops', () => {
      awareness.setState(7, { user: bob, editing: 'box' })
      renderLayer()

      act(() => editor.scrollTo({ x: 50, y: 30 }))
      expect(screen.getByTestId('remote-editing')).toHaveStyle({ left: '47px', top: '167px' })

      act(() => awareness.setState(7, { user: bob, editing: null }))
      expect(screen.queryByTestId('remote-editing')).toBeNull()
      expect(tags()).toEqual([])
    })

    it('stacks the tags of several participants who edit one label, and puts them under a cell at the top edge', () => {
      editor.placeCell('top', { x: 100, y: 10, width: 120, height: 60 })
      awareness.setState(7, { user: bob, editing: 'box' })
      awareness.setState(8, { user: vera, editing: 'box' })
      awareness.setState(9, { user: { ...vera, name: 'Гена' }, editing: 'top' })

      renderLayer()

      const outlines = screen.getAllByTestId('remote-editing')
      expect(outlines.map((outline) => outline.dataset.participant)).toEqual(['Боб', 'Вера', 'Гена'])
      expect(outlines[1]).toHaveStyle({ left: '94px', top: '194px', width: '132px', height: '72px' })
      expect(tags()).toEqual(['Боб редактирует', 'Вера редактирует', 'Гена редактирует'])
      const [bobTag, , genaTag] = screen.getAllByTestId('remote-editing-tag')
      expect(bobTag!.parentElement).toBe(screen.getAllByTestId('remote-editing-tag')[1]!.parentElement)
      expect(genaTag!.parentElement).toHaveStyle({ top: '77px' })
      expect(genaTag!.parentElement!.style.transform).toBe('')
    })

    it('shows the labels edited on the same page only, and nothing for clients that do not publish editing', () => {
      awareness.setState(7, { user: bob, page: 'p2', editing: 'box' })
      awareness.setState(8, { user: vera })

      renderLayer()

      expect(screen.queryByTestId('remote-editing')).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('warns the participant who edits a label that another participant edits too, in place of their tag', () => {
      awareness.setState(7, { user: bob, editing: 'box' })
      renderLayer()

      act(() => editor.edit({ cellId: 'box', changedRemotely: false }))

      const warning = screen.getByRole('status')
      expect(warning).toHaveTextContent(
        'Боб тоже редактирует эту подпись: сохранится правка, которую закончат последней',
      )
      expect(warning).toHaveStyle({ left: '100px', top: '196px', transform: 'translateY(-100%)' })
      expect(screen.getByTestId('remote-editing')).toBeInTheDocument()
      expect(tags()).toEqual([])

      act(() => awareness.setState(8, { user: vera, editing: 'box' }))
      expect(warning).toHaveTextContent('Боб и Вера тоже редактируют эту подпись')

      act(() => {
        awareness.setState(7, { user: bob, editing: null })
        awareness.setState(8, { user: vera, editing: null })
      })
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('warns no one who edits a label alone, and puts the warning under a cell at the top edge', () => {
      editor.placeCell('top', { x: 100, y: 10, width: 120, height: 60 })
      awareness.setState(7, { user: bob, editing: 'box' })
      renderLayer()

      act(() => editor.edit({ cellId: 'top', changedRemotely: false }))
      expect(screen.queryByRole('status')).toBeNull()
      expect(tags()).toEqual(['Боб редактирует'])

      act(() => awareness.setState(8, { user: vera, editing: 'top' }))
      expect(screen.getByRole('status')).toHaveStyle({ top: '74px' })
      expect(screen.getByRole('status').style.transform).toBe('')
    })

    it('tells the participant that the label they edit was changed meanwhile', () => {
      renderLayer()
      act(() => editor.edit({ cellId: 'box', changedRemotely: false }))

      act(() => editor.edit({ cellId: 'box', changedRemotely: true }))

      expect(screen.getByRole('status')).toHaveTextContent(
        'Подпись изменили, пока вы её редактировали. Сохранится ваша правка, Esc отменит её',
      )

      act(() => editor.edit(null))
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  it('shows a cursor outside the visible area as a label at the edge that brings it into view', async () => {
    editor = createFakeEditor({ viewport: { width: 800, height: 600 } })
    awareness.setState(7, { user: bob, cursor: { x: 1200, y: 300 } })
    renderLayer()

    expect(screen.queryByTestId('remote-cursor')).toBeNull()
    const label = screen.getByRole('button', { name: 'Показать курсор: Боб' })
    expect(label.style.transform).toBe('translate(794px, 300px) translate(-100%, -50%)')

    await userEvent.click(label)

    expect(editor.centerOn).toHaveBeenCalledWith({ x: 1200, y: 300 })
    expect(screen.getByTestId('remote-cursor').style.transform).toBe('translate(400px, 300px)')
    expect(screen.queryByRole('button', { name: 'Показать курсор: Боб' })).toBeNull()
  })
})
