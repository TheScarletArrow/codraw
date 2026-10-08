import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boardWith, shapeData } from '../diagram/testing.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { PersonalTemplates } from './PersonalTemplates.tsx'

const info = { id: 'template', title: 'API', description: 'Стандарт', createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z' }
const drawio = '<mxfile><diagram id="p" name="Схема"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" vertex="1" parent="1" value="API"><mxGeometry width="100" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
afterEach(() => vi.unstubAllGlobals())

describe('Мои шаблоны', () => {
  it('saves the selected diagram as a private template', async () => {
    const doc = boardWith(shapeData('a', 'a1', { value: 'Выделен' }), shapeData('b', 'a2', { value: 'Остальной' }))
    const editor = createFakeEditor()
    const fetch = mockFetch({ 'GET /api/templates': { body: [] }, 'POST /api/templates': { status: 201, body: info } })
    renderRoutes([{ path: '/', element: <PersonalTemplates document={doc} editor={editor} title="Моя схема" /> }])
    act(() => editor.select(['a']))
    await userEvent.click(screen.getByRole('button', { name: 'Мои шаблоны' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Сохранить доску как шаблон' }))
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const [, request] = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!
    const saved = JSON.parse(request!.body as string)
    expect(saved.title).toBe('Моя схема')
    expect(saved.drawio).toContain('Выделен')
    expect(saved.drawio).not.toContain('Остальной')
  })

  it('inserts a chosen page with new cell identities in one editor action', async () => {
    mockFetch({ 'GET /api/templates': { body: [info] }, 'GET /api/templates/template': { body: { ...info, drawio } } })
    const editor = createFakeEditor()
    const insert = vi.spyOn(editor, 'insertCells')
    renderRoutes([{ path: '/', element: <PersonalTemplates editor={editor} /> }])
    await userEvent.click(screen.getByRole('button', { name: 'Мои шаблоны' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Вставить на страницу' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Вставить', exact: true }))
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0]![0][0]).toMatchObject({ value: 'API' })
    expect(insert.mock.calls[0]![0][0]!.id).not.toBe('a')
  })

  it('requires confirmation to delete and reports a save quota failure', async () => {
    const fetch = mockFetch({ 'GET /api/templates': [{ body: [info] }, { body: [] }], 'DELETE /api/templates/template': { status: 204 }, 'POST /api/templates': { status: 409, body: { limit: 50 } } })
    renderRoutes([{ path: '/', element: <PersonalTemplates document={boardWith(shapeData('a', 'a1'))} /> }])
    await userEvent.click(screen.getByRole('button', { name: 'Мои шаблоны' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить', exact: true }))
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить шаблон', exact: true }))
    await screen.findByText(/Пока нет своих шаблонов/)
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить доску как шаблон' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Достигнут лимит: 50')
  })
})
