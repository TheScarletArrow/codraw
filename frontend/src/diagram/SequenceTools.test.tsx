import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import type { SelectedSequence } from './editor.ts'
import { EditorToolbar } from './EditorToolbar.tsx'

const diagram = (changes: Partial<SelectedSequence> = {}): SelectedSequence => ({
  diagramId: 'diagram',
  numbered: false,
  participants: [
    { key: 'client', name: 'Клиент' },
    { key: 'service', name: 'Сервис' },
  ],
  part: null,
  rows: 0,
  canChange: true,
  ...changes,
})

describe('the tools of a sequence diagram', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor()
    render(<EditorToolbar editor={editor} />)
  })

  it('are shown for a selected diagram only', () => {
    expect(screen.queryByRole('button', { name: 'Сообщение' })).toBeNull()
    act(() => editor.setState({ sequence: diagram() }))
    expect(screen.getByRole('button', { name: 'Сообщение' })).toBeVisible()
  })

  it('add participants, messages, notes and frames, and number the messages', async () => {
    act(() => editor.setState({ sequence: diagram({ rows: 2 }) }))

    await userEvent.click(screen.getByRole('button', { name: 'Участник' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сообщение' }))
    await userEvent.click(screen.getByRole('button', { name: 'Заметка' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Рамка' }), 'loop')
    await userEvent.click(screen.getByRole('button', { name: 'Нумерация' }))

    expect(editor.addSequenceParticipant).toHaveBeenCalled()
    expect(editor.addSequenceMessage).toHaveBeenCalled()
    expect(editor.addSequenceNote).toHaveBeenCalled()
    expect(editor.addSequenceFrame).toHaveBeenCalledWith('loop')
    expect(editor.setSequenceNumbering).toHaveBeenCalledWith('diagram', true)
    // The list of frames is a command, not a state.
    expect(screen.getByRole('combobox', { name: 'Рамка' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Рамка' })).toHaveAttribute('title', 'Обернуть выделенные строки в рамку')
  })

  it('copy the diagram as Mermaid and say so', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.mocked(editor.sequenceMermaid).mockReturnValue('sequenceDiagram\n')
    act(() => editor.setState({ sequence: diagram() }))

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать Mermaid' }))

    expect(editor.sequenceMermaid).toHaveBeenCalledWith('diagram')
    expect(writeText).toHaveBeenCalledWith('sequenceDiagram\n')
    expect(screen.getByRole('status')).toHaveTextContent('Mermaid скопирован')
  })

  it('change the kind of the selected participant', async () => {
    act(() => editor.setState({ sequence: diagram({ part: { type: 'participant', cellId: 'p', kind: 'participant' } }) }))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Вид участника' }), 'database')

    expect(editor.setSequenceParticipant).toHaveBeenCalledWith('p', { kind: 'database' })
  })

  it('change the participants, the kind and the activations of the selected message', async () => {
    act(() =>
      editor.setState({
        sequence: diagram({
          part: { type: 'message', cellId: 'm', from: 'client', to: 'service', arrow: 'sync', activates: false, deactivates: true },
        }),
      }),
    )
    expect(screen.getByRole('combobox', { name: 'Отправитель' })).toHaveValue('client')
    expect(screen.getByRole('button', { name: 'Завершает активацию отправителя' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Получатель' }), 'client')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Вид сообщения' }), 'reply')
    await userEvent.click(screen.getByRole('button', { name: 'Активирует получателя' }))

    expect(editor.setSequenceMessage).toHaveBeenCalledWith('m', { to: 'client' })
    expect(editor.setSequenceMessage).toHaveBeenCalledWith('m', { arrow: 'reply' })
    expect(editor.setSequenceMessage).toHaveBeenCalledWith('m', { activates: true })
  })

  it('place the selected note over participants or beside one', async () => {
    act(() => editor.setState({ sequence: diagram({ part: { type: 'note', cellId: 'n', placement: 'over', from: 'client', to: 'service' } }) }))
    expect(screen.getByRole('combobox', { name: 'Последний участник заметки' })).toHaveValue('service')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Положение заметки' }), 'right')
    expect(editor.setSequenceNote).toHaveBeenCalledWith('n', { placement: 'right' })

    act(() => editor.setState({ sequence: diagram({ part: { type: 'note', cellId: 'n', placement: 'right', from: 'client', to: 'client' } }) }))
    expect(screen.queryByRole('combobox', { name: 'Последний участник заметки' })).toBeNull()
  })

  it('change the kind of the selected frame and add branches to frames that have them', async () => {
    act(() => editor.setState({ sequence: diagram({ part: { type: 'frame', cellId: 'f', kind: 'alt', frameId: 'f' } }) }))

    await userEvent.click(screen.getByRole('button', { name: 'Ветка' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Вид рамки' }), 'loop')

    expect(editor.addSequenceBranch).toHaveBeenCalled()
    expect(editor.setSequenceFrame).toHaveBeenCalledWith('f', 'loop')
    act(() => editor.setState({ sequence: diagram({ part: { type: 'frame', cellId: 'f', kind: 'loop', frameId: 'f' } }) }))
    expect(screen.queryByRole('button', { name: 'Ветка' })).toBeNull()
  })
})
