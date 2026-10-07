import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyEdgeApi, type EdgeApi } from '../diagram/edgeApi.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { EdgeApiPanel, type EdgeApiRequest } from './EdgeApiPanel.tsx'

const ORDER: EdgeApi = {
  method: 'GET',
  path: '/orders/{id}',
  summary: 'Заказ по id',
  description: '',
  parameters: [
    { name: 'id', in: 'path', type: 'uuid', required: true, example: '', description: 'Номер заказа' },
    { name: 'X-Request-Id', in: 'header', type: 'string', required: false, example: 'r-1', description: '' },
  ],
  requestBody: null,
  responses: [
    { status: '200', description: 'OK', contentType: 'application/json', body: '{"id": "o1"}' },
    { status: '404', description: 'Нет заказа', contentType: '', body: '' },
  ],
}

describe('EdgeApiPanel', () => {
  let editor: FakeEditor
  let request: (next: EdgeApiRequest) => void

  function Page() {
    const [current, setCurrent] = useState<EdgeApiRequest | null>(null)
    request = (next) => act(() => setCurrent(next))
    return <EdgeApiPanel editor={editor} request={current} />
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    editor = createFakeEditor()
    render(<Page />)
  })

  const panel = () => screen.getByRole('complementary', { name: 'Описание API' })

  it('is not shown without a single edge with a description', () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: null, canChange: true } }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('shows the call as Swagger does: method, path, parameters, headers and responses', () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: ORDER, canChange: true } }))

    expect(within(panel()).getByText('GET')).toBeInTheDocument()
    expect(within(panel()).getByText('/orders/{id}')).toBeInTheDocument()
    expect(within(panel()).getByText('Заказ по id')).toBeInTheDocument()
    expect(within(panel()).getByRole('table', { name: 'Параметры' })).toHaveTextContent('id *uuid · путьНомер заказа')
    expect(within(panel()).getByRole('table', { name: 'Заголовки' })).toHaveTextContent('X-Request-Id')
    expect(within(panel()).getByText('404')).toBeInTheDocument()
    expect(within(panel()).getByText('{"id": "o1"}')).toBeInTheDocument()
  })

  it('edits the description and saves it with the editor', async () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: ORDER, canChange: true } }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Изменить' }))

    await userEvent.selectOptions(within(panel()).getByRole('combobox', { name: 'Метод' }), 'DELETE')
    await userEvent.click(within(panel()).getByRole('button', { name: /Ответ$/ }))
    const codes = within(panel()).getAllByRole('textbox', { name: 'Код' })
    await userEvent.type(codes.at(-1)!, '204')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Сохранить' }))

    expect(editor.setEdgeApi).toHaveBeenCalledWith({
      ...ORDER,
      method: 'DELETE',
      responses: [...ORDER.responses, { status: '204', description: '', contentType: 'application/json', body: '' }],
    })
    expect(within(panel()).queryByRole('button', { name: 'Сохранить' })).toBeNull()
  })

  it('opens an empty form for an edge without a description at the request of the page, and adds parameters of the path', async () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: null, canChange: true } }))
    request({ cellId: 'e' })

    const path = within(panel()).getByRole('textbox', { name: 'Путь' })
    expect(path).toHaveFocus()
    await userEvent.clear(path)
    await userEvent.type(path, '/users/{{userId}')
    await userEvent.click(within(panel()).getByRole('button', { name: /Из пути/ }))
    expect(within(panel()).queryByRole('button', { name: /Из пути/ })).toBeNull()
    await userEvent.click(path)
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(editor.setEdgeApi).toHaveBeenCalledWith({
      ...emptyEdgeApi(),
      path: '/users/{userId}',
      parameters: [{ name: 'userId', in: 'path', type: 'string', required: true, example: '', description: '' }],
    })
  })

  it('cancels with Escape, and drops the form when another edge is selected', async () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: ORDER, canChange: true } }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Изменить' }))
    await userEvent.keyboard('{Escape}')
    expect(within(panel()).queryByRole('button', { name: 'Сохранить' })).toBeNull()

    await userEvent.click(within(panel()).getByRole('button', { name: 'Изменить' }))
    act(() => editor.setState({ edgeApi: { cellId: 'f', api: ORDER, canChange: true } }))
    expect(within(panel()).queryByRole('button', { name: 'Сохранить' })).toBeNull()
    expect(editor.setEdgeApi).not.toHaveBeenCalled()
  })

  it('removes the description', async () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: ORDER, canChange: true } }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Удалить описание' }))
    expect(editor.setEdgeApi).toHaveBeenCalledWith(null)
  })

  it('lets whoever may not change the edge only read and copy it as OpenAPI', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: ORDER, canChange: false } }))
    request({ cellId: 'e' })

    expect(within(panel()).queryByRole('button', { name: 'Изменить' })).toBeNull()
    expect(within(panel()).queryByRole('button', { name: 'Удалить описание' })).toBeNull()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Копировать как OpenAPI' }))

    expect(await within(panel()).findByRole('status')).toHaveTextContent('Скопировано как OpenAPI')
    expect(writeText.mock.calls[0]![0]).toContain('/orders/{id}:\n    get:\n')
  })

  it('closes until the selection changes', async () => {
    act(() => editor.setState({ edgeApi: { cellId: 'e', api: ORDER, canChange: true } }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(editor.focus).toHaveBeenCalled()

    act(() => editor.setState({ edgeApi: { cellId: 'f', api: ORDER, canChange: true } }))
    expect(panel()).toBeInTheDocument()
  })
})
