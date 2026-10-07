import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { StickyPanel } from './StickyPanel.tsx'

const STICKIES = { cellIds: ['a', 'b'], color: '#fff2cc', textFit: true, locked: false }

describe('StickyPanel', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor({ viewport: { width: 1000, height: 600 } })
    editor.placeCell('a', { x: 100, y: 100, width: 160, height: 160 })
    editor.placeCell('b', { x: 300, y: 140, width: 160, height: 160 })
    render(<StickyPanel editor={editor} />)
  })

  const panel = () => screen.getByRole('toolbar', { name: 'Стикеры' })

  it('is not shown without selected stickies', () => {
    expect(screen.queryByRole('toolbar', { name: 'Стикеры' })).toBeNull()
  })

  it('stands under the selected stickies, in the middle of them, with their color chosen', () => {
    act(() => editor.setState({ stickies: STICKIES }))

    expect(panel()).toHaveAttribute('data-side', 'bottom')
    // Under the lower one, 300 + 12; around the middle of both, 280 - 110.
    expect(panel().style.top).toBe('312px')
    expect(panel().style.left).toBe('170px')
    expect(within(panel()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Жёлтый',
      'Розовый',
      'Зелёный',
      'Голубой',
      'Сиреневый',
      'Подгонять текст',
    ])
    expect(within(panel()).getByRole('button', { name: 'Жёлтый' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel()).getByRole('button', { name: 'Розовый' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(panel()).getByRole('button', { name: 'Подгонять текст' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('stands over the stickies when the canvas has no room under them, and stays on the canvas', () => {
    editor.placeCell('a', { x: -100, y: 400, width: 160, height: 160 })
    act(() => editor.setState({ stickies: { ...STICKIES, cellIds: ['a'] } }))

    expect(panel()).toHaveAttribute('data-side', 'top')
    expect(panel().style.top).toBe('388px')
    expect(panel().style.left).toBe('4px')
  })

  it('follows the stickies when the canvas scrolls', () => {
    act(() => editor.setState({ stickies: STICKIES }))

    act(() => editor.scrollTo({ x: 50, y: 20 }))

    expect(panel().style.top).toBe('292px')
  })

  it('recolors the stickies and turns fitting the text off, giving the keyboard back to the canvas', async () => {
    act(() => editor.setState({ stickies: { ...STICKIES, color: null } }))

    await userEvent.click(within(panel()).getByRole('button', { name: 'Голубой' }))
    expect(editor.setStickyColor).toHaveBeenCalledWith('#dae8fc')
    expect(editor.focus).toHaveBeenCalledTimes(1)

    await userEvent.click(within(panel()).getByRole('button', { name: 'Подгонять текст' }))
    expect(editor.setTextFit).toHaveBeenCalledWith(false)
  })

  it('keeps the keyboard on the panel for whoever uses it from the keyboard', async () => {
    act(() => editor.setState({ stickies: STICKIES }))
    within(panel()).getByRole('button', { name: 'Зелёный' }).focus()

    await userEvent.keyboard('{Enter}')

    expect(editor.setStickyColor).toHaveBeenCalledWith('#d5e8d4')
    expect(editor.focus).not.toHaveBeenCalled()
  })

  it('is disabled for locked stickies and says who locked them', () => {
    act(() =>
      editor.setState({
        stickies: { ...STICKIES, locked: true },
        lock: { all: true, canLock: false, locks: [{ cellId: 'a', lockedBy: 'Алиса' }] },
      }),
    )

    expect(within(panel()).getByRole('img', { name: 'Закреплено: Алиса' })).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'Жёлтый' })).toBeDisabled()
    expect(within(panel()).getByRole('button', { name: 'Подгонять текст' })).toBeDisabled()
  })
})
