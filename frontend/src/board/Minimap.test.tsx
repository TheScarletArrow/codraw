import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fitMap, toMap } from '../diagram/minimap.ts'
import { DEFAULT_PAGE_ID } from '../diagram/model.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FakeAwareness } from '../test/fakeProvider.ts'
import { Minimap } from './Minimap.tsx'
import type { Awareness } from './presence.ts'

const asAwareness = (awareness: FakeAwareness) => awareness as unknown as Awareness
const bob = { name: 'Боб', color: '#dc2626', avatarUrl: null }
const vera = { name: 'Вера', color: '#16a34a', avatarUrl: null }

/** A press on the minimap at a point of the minimap: jsdom lays nothing out, so client points are its units. */
const press = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', point: { x: number; y: number }) =>
  fireEvent[type](screen.getByTestId('minimap'), { button: 0, pointerId: 1, clientX: point.x, clientY: point.y })

describe('Minimap', () => {
  let editor: FakeEditor

  beforeEach(() => {
    // The visible area is 0,0 800×600; a shape far to the bottom right makes the page larger than the view.
    editor = createFakeEditor()
    editor.setState({ hasCells: true })
    editor.placeCell('far', { x: 2000, y: 1500, width: 200, height: 100 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** How the minimap shows the page now: the shape and the visible area. */
  const shown = () => fitMap({ x: 2000, y: 1500, width: 200, height: 100 }, editor.visibleArea())

  it('shows the page with the frame of the visible area in the bottom right corner of the canvas', () => {
    editor.placeEdge('edge', [
      { x: 0, y: 0 },
      { x: 2000, y: 1500 },
    ])
    render(<Minimap editor={editor} />)

    const map = screen.getByRole('region', { name: 'Мини-карта' })
    expect(map.parentElement).toHaveClass('absolute', 'right-6', 'bottom-6')
    expect(map.querySelectorAll('g rect')).toHaveLength(1)
    // Edges take the color of the theme, which is seen on its background.
    const edge = map.querySelector('polyline')!
    expect(edge).toHaveAttribute('points', '0,0 2000,1500')
    expect(edge).toHaveAttribute('stroke', 'currentColor')
    expect(edge.parentElement).toHaveClass('text-muted-foreground')
    const frame = screen.getByTestId('minimap-frame')
    const corner = toMap(shown(), { x: 0, y: 0 })
    expect(Number(frame.getAttribute('x'))).toBeCloseTo(corner.x)
    expect(Number(frame.getAttribute('y'))).toBeCloseTo(corner.y)
    expect(Number(frame.getAttribute('width'))).toBeCloseTo(800 * shown().scale)
  })

  it('draws pale what the filter of the page leaves out', () => {
    const shape = { x: 0, y: 0, width: 100, height: 50, rotation: 0, ellipse: false, fill: '#ffffff', stroke: '#000000', header: null }
    editor.pageSketch = () => ({
      shapes: [
        { ...shape, id: 'kept' },
        { ...shape, id: 'left', x: 300, dimmed: true },
      ],
      edges: [{ id: 'edge', points: [{ x: 100, y: 25 }, { x: 300, y: 25 }], dimmed: true }],
      bounds: { x: 0, y: 0, width: 400, height: 50 },
    })
    render(<Minimap editor={editor} />)

    const groups = screen.getByRole('region', { name: 'Мини-карта' }).querySelectorAll('g[opacity]')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.querySelector('rect')).toHaveAttribute('x', '300')
    expect(screen.getByRole('region', { name: 'Мини-карта' }).querySelector('polyline')).toHaveAttribute('opacity', '0.3')
  })

  it('shows nothing without a canvas or on an empty page', () => {
    const { rerender } = render(<Minimap editor={null} />)
    expect(screen.queryByTestId('minimap')).toBeNull()

    editor.setState({ hasCells: false })
    rerender(<Minimap editor={editor} />)
    expect(screen.queryByTestId('minimap')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Свернуть мини-карту' })).toBeNull()

    act(() => editor.setState({ hasCells: true }))
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
  })

  it('follows scrolling and zooming of the canvas', () => {
    render(<Minimap editor={editor} />)
    const frame = screen.getByTestId('minimap-frame')
    const width = Number(frame.getAttribute('width'))

    act(() => editor.scrollTo({ x: 600, y: 400 }))
    expect(Number(frame.getAttribute('x'))).toBeCloseTo(toMap(shown(), { x: 600, y: 400 }).x)

    act(() => editor.zoomTo(2))
    expect(Number(frame.getAttribute('width'))).toBeLessThan(width)
  })

  it('puts the point that is clicked in the middle of the canvas, ending following', () => {
    const onNavigate = vi.fn()
    render(<Minimap editor={editor} onNavigate={onNavigate} />)
    const target = toMap(shown(), { x: 2100, y: 1550 })

    press('pointerDown', target)
    press('pointerUp', target)

    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(editor.centerOn).toHaveBeenCalledTimes(1)
    const [point] = vi.mocked(editor.centerOn).mock.calls[0]!
    expect(point.x).toBeCloseTo(2100)
    expect(point.y).toBeCloseTo(1550)
    expect(editor.zoomTo).not.toHaveBeenCalled()
  })

  it('scrolls the canvas along with the frame as it is dragged, at the same scale of the minimap', () => {
    render(<Minimap editor={editor} />)
    const transform = shown()
    const middle = toMap(transform, { x: 400, y: 300 })

    press('pointerDown', middle)
    expect(editor.centerOn).not.toHaveBeenCalled()
    press('pointerMove', { x: middle.x + 10, y: middle.y + 5 })
    press('pointerMove', { x: middle.x + 20, y: middle.y + 10 })
    press('pointerUp', { x: middle.x + 20, y: middle.y + 10 })

    const [point] = vi.mocked(editor.centerOn).mock.lastCall!
    // The minimap kept its scale while the view moved under it.
    expect(point.x).toBeCloseTo(400 + 20 / transform.scale)
    expect(point.y).toBeCloseTo(300 + 10 / transform.scale)
  })

  it('keeps the middle of the canvas within what the minimap shows', () => {
    render(<Minimap editor={editor} />)
    const transform = shown()
    const middle = toMap(transform, { x: 400, y: 300 })

    press('pointerDown', middle)
    press('pointerMove', { x: middle.x - 1000, y: middle.y })
    press('pointerUp', { x: middle.x - 1000, y: middle.y })

    const [point] = vi.mocked(editor.centerOn).mock.lastCall!
    expect(point.x).toBeCloseTo(transform.extent.x)
  })

  it('ignores other buttons', () => {
    render(<Minimap editor={editor} />)

    fireEvent.pointerDown(screen.getByTestId('minimap'), { button: 2, pointerId: 1, clientX: 100, clientY: 100 })

    expect(editor.centerOn).not.toHaveBeenCalled()
  })

  it('shows the other participants of the page as dots where they look, in their colors', () => {
    const awareness = new FakeAwareness(1)
    awareness.setState(7, { user: bob, page: DEFAULT_PAGE_ID, viewport: { x: 2100, y: 1550, scale: 1 } })
    awareness.setState(8, { user: vera, page: 'other', viewport: { x: 100, y: 100, scale: 1 } })
    awareness.setState(9, { user: { ...vera, name: 'Гена' }, page: DEFAULT_PAGE_ID, viewport: null })
    render(<Minimap editor={editor} awareness={asAwareness(awareness)} />)

    const dots = screen.getAllByTestId('minimap-participant')
    expect(dots.map((dot) => dot.dataset.participant)).toEqual(['Боб'])
    const at = toMap(shown(), { x: 2100, y: 1550 })
    expect(Number(dots[0]!.getAttribute('cx'))).toBeCloseTo(at.x)
    expect(Number(dots[0]!.getAttribute('cy'))).toBeCloseTo(at.y)
    expect(dots[0]).toHaveAttribute('fill', '#dc2626')
    expect(dots[0]).toHaveTextContent('Боб')

    // Far away, the dot stays at the edge in their direction.
    act(() => awareness.setState(7, { user: bob, page: DEFAULT_PAGE_ID, viewport: { x: 99999, y: 1550, scale: 1 } }))
    expect(Number(screen.getByTestId('minimap-participant').getAttribute('cx'))).toBeCloseTo(192 - 4)

    act(() => awareness.setState(7, { user: bob, page: 'other', viewport: { x: 2100, y: 1550, scale: 1 } }))
    expect(screen.queryByTestId('minimap-participant')).toBeNull()
  })

  it('takes changes of the page at most every 150 ms', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<Minimap editor={editor} />)
    const shapes = () => screen.getByTestId('minimap').querySelectorAll('g rect').length

    act(() => editor.placeCell('near', { x: 100, y: 100, width: 50, height: 50 }))
    expect(shapes()).toBe(1)

    act(() => vi.advanceTimersByTime(150))
    expect(shapes()).toBe(2)
  })

  it('takes a change of the page made between its first picture and listening to the canvas', () => {
    // A layout effect runs after the minimap took the sketch and before it listens, as any task may in between.
    function PlaceNear() {
      useLayoutEffect(() => editor.placeCell('near', { x: 100, y: 100, width: 50, height: 50 }), [])
      return null
    }
    render(
      <>
        <Minimap editor={editor} />
        <PlaceNear />
      </>,
    )

    expect(screen.getByTestId('minimap').querySelectorAll('g rect')).toHaveLength(2)
  })

  it('collapses and expands with its button and remembers it in the browser', async () => {
    const { unmount } = render(<Minimap editor={editor} />)

    await userEvent.click(screen.getByRole('button', { name: 'Свернуть мини-карту' }))

    expect(screen.queryByRole('region', { name: 'Мини-карта' })).toBeNull()
    const expand = screen.getByRole('button', { name: 'Развернуть мини-карту' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    // The keyboard stays on the button.
    expect(expand).toHaveFocus()
    expect(localStorage.getItem('codraw.minimap')).toBe('collapsed')
    unmount()

    render(<Minimap editor={editor} />)
    expect(screen.queryByRole('region', { name: 'Мини-карта' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Развернуть мини-карту' }))
    expect(screen.getByRole('region', { name: 'Мини-карта' })).toBeInTheDocument()
    expect(localStorage.getItem('codraw.minimap')).toBe('expanded')
  })

  it('does not end following when it collapses', async () => {
    const onNavigate = vi.fn()
    render(<Minimap editor={editor} onNavigate={onNavigate} />)

    await userEvent.click(screen.getByRole('button', { name: 'Свернуть мини-карту' }))

    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('collapses and expands with the key M, in the Russian layout too, but not in fields and labels', () => {
    render(<Minimap editor={editor} />)
    const map = () => screen.queryByRole('region', { name: 'Мини-карта' })

    fireEvent.keyDown(document.body, { key: 'ь', code: 'KeyM' })
    expect(map()).toBeNull()
    fireEvent.keyDown(document.body, { key: 'm', code: 'KeyM' })
    expect(map()).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'm', code: 'KeyM', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'M', code: 'KeyM', shiftKey: true })
    fireEvent.keyDown(document.body, { key: 'm', code: 'KeyM', repeat: true })
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'm', code: 'KeyM' })
    const label = document.createElement('div')
    label.setAttribute('contenteditable', 'true')
    document.body.append(label)
    fireEvent.keyDown(label, { key: 'm', code: 'KeyM' })
    expect(map()).toBeInTheDocument()
    input.remove()
    label.remove()
  })

  it('starts collapsed on a narrow screen unless the participant expanded it', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query }))
    const { unmount } = render(<Minimap editor={editor} />)
    expect(screen.queryByRole('region', { name: 'Мини-карта' })).toBeNull()
    unmount()

    localStorage.setItem('codraw.minimap', 'expanded')
    render(<Minimap editor={editor} />)
    expect(screen.getByRole('region', { name: 'Мини-карта' })).toBeInTheDocument()
  })
})
