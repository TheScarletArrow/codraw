import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Cell, Geometry } from '@maxgraph/core'
import type { ShapeLibrary } from '../api/libraries.ts'
import { createQueryClient } from '../queryClient.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { OUTSIDE_PICTURES, useLibraries, type SaveResult } from './useLibraries.ts'

vi.mock('./preview.ts', () => ({
  previewOf: vi.fn(async () => null),
  previewOfImage: vi.fn(async () => 'data:image/png;base64,AAAA'),
}))

const LIBRARY: ShapeLibrary = {
  id: 'l1',
  name: 'Платежи',
  components: [{ id: 'c1', name: 'Шлюз оплаты', preview: null, updatedAt: '2026-10-08T10:00:00Z' }],
}
const CONTENT = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'

function open(responses: Record<string, MockResponse | MockResponse[]> = {}) {
  const fetchMock = mockFetch({ 'GET /api/libraries': { body: [LIBRARY] }, ...responses })
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useLibraries(), { wrapper })
  return { result, fetchMock }
}

const sent = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))

/** An editor whose selection is one rectangle «Сервис». */
function editorWithSelection() {
  const editor = createFakeEditor()
  const cell = new Cell('Сервис', new Geometry(0, 0, 120, 60), {})
  cell.setVertex(true)
  editor.selectionComponent = vi.fn(() => ({ cells: [cell], image: { svg: '<svg/>', width: 1, height: 1, cellIds: null }, name: 'Сервис' }))
  return editor
}

afterEach(() => vi.unstubAllGlobals())

describe('useLibraries', () => {
  it('loads the libraries of the user', async () => {
    const { result } = open()

    await waitFor(() => expect(result.current.libraries).toEqual([LIBRARY]))
  })

  it('saves the selection into a new library: the library first, then the component with its content and preview', async () => {
    const { result, fetchMock } = open({
      'POST /api/libraries': { status: 201, body: { id: 'l2', name: 'Мои фигуры', components: [] } },
      'POST /api/libraries/l2/components': { status: 201, body: { id: 'c9', name: 'Сервис', preview: null, updatedAt: '' } },
    })
    const editor = editorWithSelection()

    let saved: SaveResult | null = null
    await act(async () => {
      saved = await result.current.saveSelection(editor, { newLibrary: 'Мои фигуры' }, 'Сервис')
    })

    expect(saved).toEqual({ error: null, libraryId: 'l2' })
    expect(sent(fetchMock, 'POST', '/api/libraries')).toEqual([{ name: 'Мои фигуры' }])
    const [component] = sent(fetchMock, 'POST', '/api/libraries/l2/components')
    expect(component).toMatchObject({ name: 'Сервис', preview: 'data:image/png;base64,AAAA' })
    expect(component.content).toMatch(/^<mxGraphModel><root>.*value="Сервис"/)
  })

  it('tells why saving failed, in words', async () => {
    const { result } = open({ 'POST /api/libraries/l1/components': { status: 409, body: { limit: 200, scope: 'components' } } })

    let saved: SaveResult | null = null
    await act(async () => {
      saved = await result.current.saveSelection(editorWithSelection(), { libraryId: 'l1' })
    })
    expect(saved).toEqual({ error: 'В библиотеке уже 200 компонентов — больше не поместится', libraryId: 'l1' })

    await act(() => result.current.addSelection(editorWithSelection(), 'l1'))
    expect(result.current.error).toBe('В библиотеке уже 200 компонентов — больше не поместится')
    act(() => result.current.dismissError())
    expect(result.current.error).toBeNull()
  })

  it('tells to take out of the selection a picture at an address that a library does not keep', async () => {
    const { result, fetchMock } = open()
    const editor = createFakeEditor()
    const stencil = new Cell('', new Geometry(0, 0, 50, 50), { shape: 'image', image: 'img/lib/azure2/compute/VM.svg' } as never)
    stencil.setVertex(true)
    editor.selectionComponent = vi.fn(() => ({ cells: [stencil], image: null, name: 'VM' }))

    let saved: SaveResult | null = null
    await act(async () => {
      saved = await result.current.saveSelection(editor, { libraryId: 'l1' })
    })

    expect(saved).toEqual({ error: OUTSIDE_PICTURES, libraryId: 'l1' })
    expect(sent(fetchMock, 'POST', '/api/libraries/l1/components')).toEqual([])
  })

  it('adds a copy of a component, downloading its content once for the time it was changed', async () => {
    const { result, fetchMock } = open({ 'GET /api/libraries/l1/components/c1': { body: { ...LIBRARY.components[0], content: CONTENT } } })
    const editor = createFakeEditor()
    await waitFor(() => expect(result.current.libraries).toBeDefined())

    await act(() => result.current.insert(editor, 'l1', LIBRARY.components[0]!, { x: 10, y: 20 }))
    await act(() => result.current.drop(editor, JSON.stringify({ libraryId: 'l1', componentId: 'c1' }), { x: 30, y: 40 }))

    expect(editor.insertComponent).toHaveBeenNthCalledWith(1, CONTENT, { x: 10, y: 20 })
    expect(editor.insertComponent).toHaveBeenNthCalledWith(2, CONTENT, { x: 30, y: 40 })
    expect(sent(fetchMock, 'GET', '/api/libraries/l1/components/c1')).toHaveLength(1)

    await act(() => result.current.applyStyle(editor, 'l1', LIBRARY.components[0]!))
    expect(editor.applyComponentStyle).toHaveBeenCalledWith(CONTENT)
  })

  it('says when a component is gone', async () => {
    const { result } = open({ 'GET /api/libraries/l1/components/c1': { status: 404 } })

    await act(() => result.current.insert(createFakeEditor(), 'l1', LIBRARY.components[0]!))

    expect(result.current.error).toBe('Этой библиотеки или компонента уже нет')
  })

  it('adds the picture files that fit and names those that do not', async () => {
    const { result, fetchMock } = open({
      'GET /api/libraries/usage': { body: { used: 0, quota: 1000, componentSize: 1000, imageSize: 100 } },
      'POST /api/libraries/l1/components': { status: 201, body: { id: 'c9', name: 'logo', preview: null, updatedAt: '' } },
    })
    const files = [
      new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' }),
      new File(['x'.repeat(200)], 'big.png', { type: 'image/png' }),
      new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }),
    ]

    await act(() => result.current.addFiles('l1', files))

    expect(sent(fetchMock, 'POST', '/api/libraries/l1/components').map((body) => body.name)).toEqual(['logo'])
    expect(result.current.error).toBe(
      'Не добавлены «big.png»: Изображение больше 1 КБ; «doc.pdf»: Формат не поддерживается: подходят PNG, JPEG, GIF, WebP и SVG',
    )
  })
})
