import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { SelectionProperties } from '../diagram/editor.ts'
import { ELEMENT_KEY, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { shapeData } from '../diagram/testing.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { PropertiesPanel, type PropertiesRequest } from './PropertiesPanel.tsx'

const API: SelectionProperties = {
  target: 'shape',
  cellId: 'api',
  properties: { name: 'API', kind: 'c4-container', technology: 'Java', description: 'Заказы', owner: '', tags: ['core'] },
  defaultKind: 'c4-container',
  format: 'c4',
  showTechnology: false,
  element: true,
  canChange: true,
}

const CACHE: SelectionProperties = {
  ...API,
  cellId: 'cache',
  properties: { name: 'Кэш', kind: 'cache', technology: 'Redis', description: '', owner: 'Платформа', tags: [] },
  defaultKind: 'cache',
  format: 'plain',
}

const QUEUE_EDGE: SelectionProperties = {
  target: 'edge',
  cellId: 'flow',
  properties: { technology: 'Kafka', interaction: 'async' },
  canChange: true,
}

describe('PropertiesPanel', () => {
  let editor: FakeEditor
  let doc: Y.Doc
  let request: (next: PropertiesRequest) => void
  const onClose = vi.fn()

  function Page() {
    const [current, setCurrent] = useState<PropertiesRequest | null>(null)
    useEffect(() => {
      request = (next) => act(() => setCurrent(next))
    })
    return <PropertiesPanel editor={editor} document={doc} request={current} onClose={onClose} />
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    onClose.mockReset()
    editor = createFakeEditor()
    doc = new Y.Doc()
    initializeDocument(doc)
    render(<Page />)
  })

  const panel = () => screen.getByRole('complementary', { name: 'Свойства' })
  const field = (name: string) => within(panel()).getByLabelText(name)

  it('asks for a shape or an edge without one selected', () => {
    expect(panel()).toHaveTextContent('Выделите фигуру или связь')
  })

  it('shows the properties of the selected shape and follows the selection', () => {
    act(() => editor.setState({ properties: API }))

    expect(field('Имя')).toHaveValue('API')
    expect(field('Тип')).toHaveValue('c4-container')
    expect(within(field('Тип')).getByRole('option', { name: 'Container (по фигуре)' })).toBeInTheDocument()
    expect(field('Технология')).toHaveValue('Java')
    expect(field('Описание')).toHaveValue('Заказы')
    expect(field('Теги')).toHaveValue('core')
    expect(within(panel()).queryByLabelText('Технология на схеме')).toBeNull()

    act(() => editor.setState({ properties: CACHE }))
    expect(field('Имя')).toHaveValue('Кэш')
    expect(field('Владелец')).toHaveValue('Платформа')
    expect(within(panel()).getByLabelText('Технология на схеме')).not.toBeChecked()
  })

  it('applies a field by Enter, as one change of that element', async () => {
    act(() => editor.setState({ properties: API }))

    await userEvent.clear(field('Технология'))
    await userEvent.type(field('Технология'), 'Kotlin{Enter}')

    expect(editor.setElementProperties).toHaveBeenCalledTimes(1)
    expect(editor.setElementProperties).toHaveBeenCalledWith('api', { technology: 'Kotlin' })
  })

  it('applies a field when it loses the keyboard, and nothing when nothing changed', async () => {
    act(() => editor.setState({ properties: API }))

    await userEvent.click(field('Имя'))
    await userEvent.click(field('Владелец'))
    expect(editor.setElementProperties).not.toHaveBeenCalled()

    await userEvent.type(field('Владелец'), 'Команда заказов')
    await userEvent.click(field('Имя'))
    expect(editor.setElementProperties).toHaveBeenCalledWith('api', { owner: 'Команда заказов' })
  })

  it('brings back the value of the element by Escape', async () => {
    act(() => editor.setState({ properties: API }))

    await userEvent.type(field('Имя'), ' v2{Escape}')

    expect(field('Имя')).toHaveValue('API')
    await userEvent.click(field('Технология'))
    expect(editor.setElementProperties).not.toHaveBeenCalled()
  })

  it('applies what was typed to the element it was typed for when another one is selected', async () => {
    act(() => editor.setState({ properties: API }))

    await userEvent.type(field('Описание'), ' и оплата')
    act(() => editor.setState({ properties: CACHE }))

    expect(editor.setElementProperties).toHaveBeenCalledWith('api', { description: 'Заказы и оплата' })
    expect(field('Имя')).toHaveValue('Кэш')
  })

  it('keeps what is typed when someone else changes the element', async () => {
    act(() => editor.setState({ properties: API }))

    await userEvent.type(field('Имя'), 'ish')
    act(() => editor.setState({ properties: { ...API, properties: { ...API.properties, name: 'Gateway' } } }))

    expect(field('Имя')).toHaveValue('APIish')
  })

  it('changes the kind, the tags and whether the technology is on the diagram', async () => {
    act(() => editor.setState({ properties: CACHE }))

    await userEvent.selectOptions(field('Тип'), 'База данных')
    expect(editor.setElementProperties).toHaveBeenLastCalledWith('cache', { kind: 'database' })
    await userEvent.selectOptions(field('Тип'), 'Без типа')
    expect(editor.setElementProperties).toHaveBeenLastCalledWith('cache', { kind: null })
    await userEvent.type(field('Теги'), 'pci, core pci{Enter}')
    expect(editor.setElementProperties).toHaveBeenLastCalledWith('cache', { tags: ['pci', 'core'] })
    await userEvent.click(within(panel()).getByLabelText('Технология на схеме'))
    expect(editor.setElementProperties).toHaveBeenLastCalledWith('cache', { showTechnology: true })
  })

  it('suggests the technologies of the kind and of the board, and the owners of the board', async () => {
    doc.transact(() =>
      writeCell(getCells(doc), shapeData('a', 'a0', { style: { [ELEMENT_KEY]: 'e1', codrawTechnology: 'Valkey 8', codrawOwner: 'Платёжная команда' } })),
    )
    act(() => editor.setState({ properties: CACHE }))

    await userEvent.click(field('Технология'))
    const technologies = document.getElementById(field('Технология').getAttribute('list')!)!
    expect([...technologies.querySelectorAll('option')].map((option) => option.value)).toEqual(['Redis', 'Memcached', 'Valkey', 'Valkey 8'])
    await userEvent.click(field('Владелец'))
    const owners = document.getElementById(field('Владелец').getAttribute('list')!)!
    expect([...owners.querySelectorAll('option')].map((option) => option.value)).toEqual(['Платёжная команда'])
  })

  it('changes the technology and the interaction of an edge', async () => {
    act(() => editor.setState({ properties: QUEUE_EDGE }))

    expect(within(panel()).getByRole('heading')).toHaveTextContent('Свойства связи')
    expect(within(panel()).getByLabelText('Асинхронная')).toBeChecked()
    await userEvent.click(within(panel()).getByLabelText('Синхронная'))
    expect(editor.setEdgeProperties).toHaveBeenLastCalledWith('flow', { interaction: 'sync' })
    await userEvent.clear(field('Технология / протокол'))
    await userEvent.type(field('Технология / протокол'), 'gRPC{Enter}')
    expect(editor.setEdgeProperties).toHaveBeenLastCalledWith('flow', { technology: 'gRPC' })
  })

  it('shows the properties without fields to a viewer and of a locked element', () => {
    act(() => editor.setState({ properties: { ...API, canChange: false } }))

    expect(within(panel()).queryByRole('textbox')).toBeNull()
    expect(panel()).toHaveTextContent('Container')
    expect(panel()).toHaveTextContent('Java')
    expect(panel()).toHaveTextContent('core')

    act(() => editor.setState({ properties: { ...QUEUE_EDGE, canChange: false } }))
    expect(within(panel()).queryByRole('radio')).toBeNull()
    expect(panel()).toHaveTextContent('Асинхронная')
  })

  it('takes the keyboard when the menu asks for it, and closes by its button', async () => {
    act(() => editor.setState({ properties: API }))

    request({ cellId: 'api' })
    expect(field('Имя')).toHaveFocus()

    await userEvent.click(within(panel()).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
  })
})
