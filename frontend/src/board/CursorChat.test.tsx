import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FakeAwareness } from '../test/fakeProvider.ts'
import { CHAT_KEEP_MS, CursorChat } from './CursorChat.tsx'
import { CHAT_INTERVAL_MS, CHAT_MAX_LENGTH, type Awareness } from './presence.ts'

describe('CursorChat', () => {
  let editor: FakeEditor
  let awareness: FakeAwareness
  const local = () => awareness.getStates().get(awareness.clientID) ?? {}
  const field = () => screen.queryByRole('textbox', { name: 'Сообщение у курсора' })
  /** Where the field or the bubble stands: the transform of its layer. */
  const position = () => (field() ?? screen.getByTestId('own-chat')).parentElement!.style.transform

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    editor = createFakeEditor()
    awareness = new FakeAwareness(1)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const chat = ({ editor: shown = editor, online = true }: { editor?: FakeEditor | null; online?: boolean } = {}) => (
    <CursorChat editor={shown} awareness={awareness as unknown as Awareness} online={online} color="#2563eb" />
  )
  /** Presses `/` with the keyboard on the canvas, or on `target`; `false` when the browser would not type it. */
  const slash = (target: Element = document.body, modifiers: Partial<KeyboardEventInit> = {}) => {
    let typed = true
    act(() => {
      typed = fireEvent.keyDown(target, { key: '/', ...modifiers })
    })
    return typed
  }
  const type = (text: string) => fireEvent.change(field()!, { target: { value: text } })

  it('opens a field at the pointer with /, which it does not type', () => {
    render(chat())
    act(() => editor.movePointer({ x: 120, y: 80 }))

    expect(slash()).toBe(false)

    expect(field()).toHaveFocus()
    expect(field()).toHaveValue('')
    expect(position()).toBe('translate(120px, 80px)')
    // Nothing to show yet.
    expect(local().chat ?? null).toBeNull()
  })

  it('publishes what is typed at once and then at most ten times a second', () => {
    render(chat())
    slash()
    const updates: unknown[] = []
    awareness.on('change', () => updates.push(local().chat))

    type('с')
    type('см')
    type('смо')
    expect(updates).toEqual([{ text: 'с', at: Date.now() }])

    act(() => vi.advanceTimersByTime(CHAT_INTERVAL_MS))
    expect(updates).toEqual([
      { text: 'с', at: Date.now() - CHAT_INTERVAL_MS },
      { text: 'смо', at: Date.now() - CHAT_INTERVAL_MS },
    ])
  })

  it('takes at most the longest message', () => {
    render(chat())
    slash()

    type('я'.repeat(CHAT_MAX_LENGTH + 20))

    expect(field()).toHaveValue('я'.repeat(CHAT_MAX_LENGTH))
    expect(local().chat).toMatchObject({ text: 'я'.repeat(CHAT_MAX_LENGTH) })
  })

  it('keeps the message for a while after Enter, then removes it', () => {
    render(chat())
    slash()
    type('смотри сюда')

    fireEvent.keyDown(field()!, { key: 'Enter' })

    expect(field()).toBeNull()
    expect(screen.getByTestId('own-chat')).toHaveTextContent('смотри сюда')
    expect(local().chat).toMatchObject({ text: 'смотри сюда' })
    expect(editor.focus).toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(CHAT_KEEP_MS - 1))
    expect(local().chat).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('own-chat')).toBeNull()
    expect(local().chat).toBeNull()
  })

  it('keeps the message after a click past the field, and closes an empty one', () => {
    render(chat())
    slash()
    type('смотри сюда')

    fireEvent.blur(field()!)
    expect(screen.getByTestId('own-chat')).toHaveTextContent('смотри сюда')

    slash()
    expect(screen.queryByTestId('own-chat')).toBeNull()
    fireEvent.keyDown(field()!, { key: 'Enter' })
    expect(field()).toBeNull()
    expect(local().chat).toBeNull()
  })

  it('removes the message at once with Escape, which ends nothing else', () => {
    render(chat())
    const escapes = vi.fn()
    document.addEventListener('keydown', escapes)
    slash()
    type('смотри сюда')

    fireEvent.keyDown(field()!, { key: 'Escape' })

    expect(field()).toBeNull()
    expect(local().chat).toBeNull()
    expect(editor.focus).toHaveBeenCalled()
    expect(escapes).toHaveBeenCalledTimes(1)
    expect(escapes.mock.calls[0]![0]).toMatchObject({ key: '/' })
    document.removeEventListener('keydown', escapes)
  })

  it('takes / as a character in fields and labels, and with Ctrl or Cmd', () => {
    render(chat())
    const input = document.body.appendChild(document.createElement('input'))
    const label = document.body.appendChild(document.createElement('div'))
    label.setAttribute('contenteditable', 'true')

    expect(slash(input)).toBe(true)
    expect(slash(label)).toBe(true)
    expect(slash(document.body, { ctrlKey: true })).toBe(true)
    expect(slash(document.body, { metaKey: true })).toBe(true)

    expect(field()).toBeNull()
    input.remove()
    label.remove()
  })

  it('follows the pointer, scrolling and zoom', () => {
    render(chat())
    act(() => editor.movePointer({ x: 120, y: 80 }))
    slash()

    act(() => editor.movePointer({ x: 300, y: 200 }))
    expect(position()).toBe('translate(300px, 200px)')
    // The pointer leaves the canvas: the field stays where it was.
    act(() => editor.movePointer(null))
    act(() => editor.scrollTo({ x: 100, y: 50 }))
    expect(position()).toBe('translate(200px, 150px)')
  })

  it('opens at the last position of the pointer on the canvas, or in the middle of the view before any', () => {
    render(chat())
    slash()
    expect(position()).toBe('translate(400px, 300px)')
    fireEvent.keyDown(field()!, { key: 'Escape' })

    act(() => {
      editor.movePointer({ x: 50, y: 60 })
      editor.movePointer(null)
    })
    slash()
    expect(position()).toBe('translate(50px, 60px)')
  })

  it('removes the message with the canvas of its page, with the connection and when the board closes', () => {
    const { rerender, unmount } = render(chat())
    slash()
    type('смотри сюда')

    const next = createFakeEditor({ pageId: 'p2' })
    rerender(chat({ editor: next }))
    expect(field()).toBeNull()
    expect(local().chat).toBeNull()

    slash()
    type('ещё')
    rerender(chat({ editor: next, online: false }))
    expect(field()).toBeNull()
    expect(local().chat).toBeNull()

    rerender(chat({ editor: next }))
    slash()
    type('и ещё')
    unmount()
    expect(local().chat).toBeNull()
  })

  it('opens nothing without a canvas', () => {
    render(chat({ editor: null }))

    expect(slash()).toBe(true)
    expect(field()).toBeNull()
  })
})
