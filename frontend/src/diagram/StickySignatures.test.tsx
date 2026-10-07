import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { participantColor } from '../board/identity.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { StickySignatures } from './StickySignatures.tsx'

const ALICE = '0199a000-0000-7000-8000-00000000000a'

describe('StickySignatures', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor()
    editor.placeCell('a', { x: 100, y: 100, width: 160, height: 160 })
    editor.placeCell('b', { x: 300, y: 100, width: 160, height: 160 })
    render(<StickySignatures editor={editor} />)
  })

  const signatures = () => screen.queryAllByTestId('sticky-signature')

  it('shows who wrote each sticky at its bottom, in the color of its text, after a dot of their color', () => {
    act(() =>
      editor.setSignatures([
        { cellId: 'a', by: ALICE, name: 'Алиса', color: '#1f2328' },
        { cellId: 'b', by: null, name: 'Гость 12', color: '#ffffff' },
      ]),
    )

    const [alice, guest] = signatures()
    expect(alice).toHaveTextContent('Алиса')
    expect(alice).toHaveAttribute('data-cell', 'a')
    // 8 from the sides, its 11 high line 3 above the bottom.
    expect(alice!.style).toMatchObject({ left: '108px', top: '246px', width: '144px', fontSize: '11px', color: 'rgb(31, 35, 40)' })
    // The color of the participant, as the style of an element reads it.
    const color = document.createElement('span').style
    color.backgroundColor = participantColor(ALICE)
    expect((alice!.firstElementChild as HTMLElement).style.backgroundColor).toBe(color.backgroundColor)
    expect(guest).toHaveTextContent('Гость 12')
    expect(guest!.childElementCount).toBe(1)
  })

  it('grows and shrinks with the zoom, and is not shown when it would be too small to read', () => {
    act(() => editor.setSignatures([{ cellId: 'a', by: ALICE, name: 'Алиса', color: '#1f2328' }]))

    act(() => editor.setState({ scale: 2 }))
    expect(signatures()[0]!.style.fontSize).toBe('22px')

    act(() => editor.setState({ scale: 0.5 }))
    expect(signatures()).toEqual([])
  })

  it('follows the stickies when the canvas scrolls', () => {
    act(() => editor.setSignatures([{ cellId: 'a', by: ALICE, name: 'Алиса', color: '#1f2328' }]))

    act(() => editor.scrollTo({ x: 40, y: 30 }))

    expect(signatures()[0]!.style).toMatchObject({ left: '68px', top: '216px' })
  })
})
