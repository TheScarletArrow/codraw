import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { CommentThread, Person } from '../api/comments.ts'
import type { Decision } from '../api/decisions.ts'
import { getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { writeStatus } from '../diagram/status.ts'
import { downloadBlob } from '../lib/download.ts'
import { createQueryClient } from '../queryClient.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { DecisionsPanel } from './DecisionsPanel.tsx'
import type { DecisionFocus } from './decisions.ts'
import { useDecisions } from './useDecisions.ts'

vi.mock('../lib/download.ts', async (original) => ({
  ...(await original<typeof import('../lib/download.ts')>()),
  downloadBlob: vi.fn(),
}))

const boardId = '0199a000-0000-7000-8000-000000000001'
const decisionsUrl = `/api/boards/${boardId}/decisions`
const threadsUrl = `/api/boards/${boardId}/threads`
const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const pages = [
  { id: 'page-1', name: 'Обзор' },
  { id: 'page-2', name: 'Данные' },
]

const decision = (id: string, number: number, changes: Partial<Decision> = {}): Decision => ({
  id,
  number,
  title: id,
  status: 'proposed',
  supersededBy: null,
  decidedOn: '2026-10-09',
  author: alice,
  context: '',
  options: '',
  outcome: '',
  consequences: '',
  elements: [],
  createdAt: '2026-10-09T10:00:00Z',
  updatedAt: '2026-10-09T10:00:00Z',
  ...changes,
})

const kafka = decision('kafka', 8, {
  title: 'Kafka для событий',
  status: 'accepted',
  context: 'Нужна очередь событий.',
  outcome: 'Kafka.',
  elements: [
    { pageId: 'page-1', cellId: 'queue' },
    { pageId: 'page-2', cellId: 'gone' },
  ],
})
const rabbit = decision('rabbit', 3, {
  title: 'RabbitMQ',
  status: 'superseded',
  supersededBy: 'kafka',
  elements: [{ pageId: 'page-1', cellId: 'queue' }],
})
const cache = decision('cache', 9, { title: 'Redis для кэша' })

function boardDocument(): Y.Doc {
  const document = new Y.Doc()
  initializeDocument(document)
  const cell = (id: string, value: string) => ({
    id,
    kind: 'vertex' as const,
    parent: '1',
    order: 'a0',
    value,
    geometry: null,
    source: null,
    target: null,
    style: {},
  })
  const cells = getCells(document, 'page-1')
  writeCell(cells, cell('queue', 'Очередь'))
  writeCell(cells, cell('api', 'API'))
  writeCell(cells, cell('redis', 'Redis'))
  writeStatus(cells.get('api')!, 'review', null, 0)
  return document
}

interface Setup {
  decisions?: Decision[] | MockResponse[]
  threads?: CommentThread[]
  responses?: Record<string, MockResponse | MockResponse[]>
  canEdit?: boolean
  focus?: DecisionFocus | null
  editor?: FakeEditor
}

function renderPanel({ decisions = [kafka, rabbit, cache], threads = [], responses = {}, canEdit = true, focus = null, editor = createFakeEditor() }: Setup = {}) {
  const fetchMock = mockFetch({
    [`GET ${decisionsUrl}`]: decisions.some((entry) => !('id' in entry)) ? (decisions as MockResponse[]) : { body: decisions },
    [`GET /api/boards/${boardId}/people`]: { body: [alice] },
    ...responses,
  })
  const onShowElement = vi.fn()
  const onChanged = vi.fn()
  const onCommentsChanged = vi.fn()
  const onClose = vi.fn()
  const document = boardDocument()
  function Panel() {
    const decisions = useDecisions(boardId)
    const [current, setFocus] = useState(focus)
    return (
      <DecisionsPanel
        boardId={boardId}
        boardTitle="Заказы"
        userId="alice"
        isOwner
        canEdit={canEdit}
        decisions={decisions.data}
        failed={decisions.isError}
        threads={threads}
        pages={pages}
        currentPageId="page-1"
        document={document}
        editor={editor}
        focus={current}
        onFocusChange={setFocus}
        onShowElement={onShowElement}
        onChanged={onChanged}
        onCommentsChanged={onCommentsChanged}
        onClose={onClose}
      />
    )
  }
  const queryClient = createQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <Panel />
    </QueryClientProvider>,
  )
  return { fetchMock, onShowElement, onChanged, onCommentsChanged, onClose, editor }
}

const requestsOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)
    .map(([, init]) => (init?.body ? JSON.parse(init.body as string) : undefined))

const card = (name: string) => screen.getByRole('article', { name })

beforeEach(() => {
  vi.mocked(downloadBlob).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DecisionsPanel', () => {
  it('lists the decisions by number with their status, filtered by status', async () => {
    renderPanel()

    const list = await screen.findAllByRole('article')
    expect(list.map((item) => item.getAttribute('aria-label'))).toEqual([
      'ADR-0008 Kafka для событий',
      'ADR-0003 RabbitMQ',
      'ADR-0009 Redis для кэша',
    ])
    expect(within(card('ADR-0003 RabbitMQ')).getByText('Заменено решением ADR-0008')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Предложено 1' }))

    expect(screen.getAllByRole('article').map((item) => item.getAttribute('aria-label'))).toEqual(['ADR-0009 Redis для кэша'])
    await userEvent.click(screen.getByRole('button', { name: 'Отклонено 0' }))
    expect(screen.getByText('Решений с таким статусом нет.')).toBeInTheDocument()
  })

  it('opens a decision: its sections and its elements, which it goes to', async () => {
    const { onShowElement } = renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Kafka для событий/ }))

    const opened = card('ADR-0008 Kafka для событий')
    expect(within(opened).getByRole('region', { name: 'Контекст' })).toHaveTextContent('Нужна очередь событий.')
    expect(within(opened).queryByRole('region', { name: 'Последствия' })).toBeNull()
    const elements = within(opened).getByRole('region', { name: 'Элементы' })
    expect(within(elements).getByRole('button', { name: '«Очередь» · Обзор' })).toBeEnabled()
    expect(within(elements).getByRole('button', { name: 'Элемент удалён · Данные' })).toBeDisabled()

    await userEvent.click(within(elements).getByRole('button', { name: '«Очередь» · Обзор' }))

    expect(onShowElement).toHaveBeenCalledWith('page-1', 'queue')
  })

  it('writes down a new decision about the selected elements', async () => {
    const editor = createFakeEditor()
    const added = decision('new', 10, { title: 'Шлюз API', elements: [{ pageId: 'page-1', cellId: 'api' }] })
    const { fetchMock, onChanged } = renderPanel({
      editor,
      decisions: [{ body: [kafka] }, { body: [kafka, added] }],
      responses: { [`POST ${decisionsUrl}`]: { status: 201, body: added } },
    })
    act(() => editor.select(['api', 'redis']))

    await userEvent.click(await screen.findByRole('button', { name: 'Новое решение' }))
    const form = screen.getByRole('form', { name: 'Новое решение' })
    await userEvent.click(within(form).getByRole('button', { name: 'Не привязывать «Redis»' }))
    await userEvent.type(within(form).getByLabelText('Название'), 'Шлюз API')
    await userEvent.type(within(form).getByLabelText('Контекст'), 'Много клиентов')
    await userEvent.click(within(form).getByRole('button', { name: 'Записать' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(requestsOf(fetchMock, 'POST', decisionsUrl)).toEqual([
      expect.objectContaining({
        title: 'Шлюз API',
        status: 'proposed',
        supersededBy: null,
        context: 'Много клиентов',
        elements: [{ pageId: 'page-1', cellId: 'api' }],
      }),
    ])
    expect(await screen.findByRole('article', { name: 'ADR-0010 Шлюз API' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Новое решение' })).toBeNull()
    expect(within(card('ADR-0010 Шлюз API')).getByRole('button', { name: /Шлюз API/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('says when the board has as many decisions as allowed', async () => {
    renderPanel({ responses: { [`POST ${decisionsUrl}`]: { status: 409, body: { limit: 500 } } } })

    await userEvent.click(await screen.findByRole('button', { name: 'Новое решение' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Ещё одно')
    await userEvent.click(screen.getByRole('button', { name: 'Записать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('На доске уже 500 решений — больше нельзя')
  })

  it('changes a decision: superseded by another decision of the board', async () => {
    const changed = { ...cache, status: 'superseded' as const, supersededBy: 'kafka' }
    const { fetchMock } = renderPanel({
      decisions: [{ body: [kafka, cache] }, { body: [kafka, changed] }],
      responses: { [`PUT ${decisionsUrl}/cache`]: { body: changed } },
    })

    await userEvent.click(await screen.findByRole('button', { name: /Redis для кэша/ }))
    await userEvent.click(within(card('ADR-0009 Redis для кэша')).getByRole('button', { name: 'Изменить' }))
    const form = screen.getByRole('form', { name: 'Изменить решение ADR-0009' })
    await userEvent.selectOptions(within(form).getByLabelText('Статус'), 'Заменено')
    await userEvent.selectOptions(within(form).getByLabelText('Заменено решением'), 'ADR-0008 Kafka для событий')
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Изменить решение ADR-0009' })).toBeNull())
    expect(requestsOf(fetchMock, 'PUT', `${decisionsUrl}/cache`)).toEqual([
      expect.objectContaining({ title: 'Redis для кэша', status: 'superseded', supersededBy: 'kafka' }),
    ])
    expect(await screen.findByText('Заменено решением ADR-0008')).toBeInTheDocument()
  })

  it('links the selected elements, offers those waiting for a review, and unlinks one', async () => {
    const editor = createFakeEditor()
    const { fetchMock } = renderPanel({
      editor,
      responses: { [`PUT ${decisionsUrl}/cache/elements`]: { body: cache } },
    })
    act(() => editor.select(['redis']))

    await userEvent.click(await screen.findByRole('button', { name: /Redis для кэша/ }))
    const opened = card('ADR-0009 Redis для кэша')
    await userEvent.click(within(opened).getByRole('button', { name: 'Привязать выделенные (1)' }))
    const review = within(opened).getByRole('group', { name: 'Ждут ревью' })
    expect(review).toHaveTextContent('«API»')
    await userEvent.click(within(review).getByRole('button', { name: 'Привязать «API»' }))

    await waitFor(() =>
      expect(requestsOf(fetchMock, 'PUT', `${decisionsUrl}/cache/elements`)).toEqual([
        { elements: [{ pageId: 'page-1', cellId: 'redis' }] },
        { elements: [{ pageId: 'page-1', cellId: 'api' }] },
      ]),
    )
  })

  it('unlinks an element of a decision', async () => {
    const { fetchMock } = renderPanel({ responses: { [`PUT ${decisionsUrl}/kafka/elements`]: { body: kafka } } })

    await userEvent.click(await screen.findByRole('button', { name: /Kafka для событий/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Отвязать «Очередь»' }))

    await waitFor(() =>
      expect(requestsOf(fetchMock, 'PUT', `${decisionsUrl}/kafka/elements`)).toEqual([
        { elements: [{ pageId: 'page-2', cellId: 'gone' }] },
      ]),
    )
  })

  it('deletes a decision once confirmed', async () => {
    const { fetchMock, onChanged } = renderPanel({ responses: { [`DELETE ${decisionsUrl}/cache`]: { status: 204 } } })

    await userEvent.click(await screen.findByRole('button', { name: /Redis для кэша/ }))
    await userEvent.click(within(card('ADR-0009 Redis для кэша')).getByRole('button', { name: 'Удалить' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Удалить решение ADR-0009' })).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(requestsOf(fetchMock, 'DELETE', `${decisionsUrl}/cache`)).toHaveLength(1)
  })

  it('shows the decisions of an element in focus, and all of them again', async () => {
    renderPanel({ focus: { pageId: 'page-1', cellId: 'queue' } })

    expect((await screen.findAllByRole('article')).map((item) => item.getAttribute('aria-label'))).toEqual([
      'ADR-0008 Kafka для событий',
      'ADR-0003 RabbitMQ',
    ])
    expect(screen.getByText(/Решения элемента/)).toHaveTextContent('Решения элемента «Очередь»')

    await userEvent.click(screen.getByRole('button', { name: 'Все решения' }))

    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('lets a viewer read, download and discuss decisions, not change them', async () => {
    const started: CommentThread = {
      id: 'thread',
      pageId: 'page-1',
      cellId: null,
      point: null,
      decisionId: 'kafka',
      createdAt: '2026-10-09T10:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
      assignee: null,
      comments: [],
    }
    const { fetchMock, onCommentsChanged } = renderPanel({
      canEdit: false,
      responses: {
        [`POST ${threadsUrl}`]: { status: 201, body: started },
        [`GET ${threadsUrl}`]: { body: [started] },
      },
    })

    await userEvent.click(await screen.findByRole('button', { name: /Kafka для событий/ }))
    const opened = card('ADR-0008 Kafka для событий')
    expect(screen.queryByRole('button', { name: 'Новое решение' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Импорт' })).toBeNull()
    expect(within(opened).queryByRole('button', { name: 'Изменить' })).toBeNull()
    expect(within(opened).queryByRole('button', { name: 'Отвязать «Очередь»' })).toBeNull()

    await userEvent.click(within(opened).getByRole('button', { name: 'Скачать .md' }))
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]!
    expect(name).toBe('0008-kafka-dlya-sobytiy.md')
    expect(await blob.text()).toContain('# Kafka для событий')

    await userEvent.type(within(opened).getByRole('combobox', { name: 'Комментарий к решению' }), 'Почему не Pulsar?{Enter}')

    await waitFor(() => expect(onCommentsChanged).toHaveBeenCalled())
    expect(requestsOf(fetchMock, 'POST', threadsUrl)).toEqual([
      { pageId: 'page-1', cellId: null, point: null, decisionId: 'kafka', body: 'Почему не Pulsar?', mentions: [] },
    ])
  })

  it('opens the decision of a notification with its thread', async () => {
    const thread: CommentThread = {
      id: 'thread',
      pageId: 'page-1',
      cellId: null,
      point: null,
      decisionId: 'cache',
      createdAt: '2026-10-09T10:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
      assignee: null,
      comments: [
        { id: 'c', author: alice, body: 'Почему Redis?', mentions: [], reactions: [], createdAt: '2026-10-09T10:00:00Z', editedAt: null },
      ],
    }
    renderPanel({ threads: [thread], focus: { decisionId: 'cache', threadId: 'thread' } })

    const opened = await screen.findByRole('article', { name: 'ADR-0009 Redis для кэша' })
    expect(opened).toHaveAttribute('aria-current', 'true')
    const discussion = within(opened).getByRole('region', { name: 'Обсуждение' })
    expect(within(discussion).getByRole('article', { name: 'Ветка: Обсуждение решения' })).toHaveAttribute('aria-current', 'true')
    expect(discussion).toHaveTextContent('Почему Redis?')
  })

  it('downloads all decisions in a .zip of files of MADR', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Выгрузить .zip' }))

    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]!
    expect(name).toBe('Заказы — решения.zip')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('0008-kafka-dlya-sobytiy.md')
    expect(text).toContain('0003-rabbitmq.md')
    expect(text).toContain('status: "superseded by [ADR-0008](0008-kafka-dlya-sobytiy.md)"')
  })

  it('imports chosen files of MADR and says what it did', async () => {
    const imported = decision('imported', 4, { title: 'Pulsar' })
    const { fetchMock, onChanged } = renderPanel({
      decisions: [{ body: [kafka] }, { body: [kafka, imported] }],
      responses: {
        [`POST ${decisionsUrl}`]: [{ status: 201, body: imported }, { status: 409, body: { number: 8 } }],
      },
    })
    await screen.findAllByRole('article')

    await userEvent.upload(screen.getByLabelText('Файлы решений'), [
      new File(['# Pulsar\n\n* Status: accepted'], '0004-pulsar.md', { type: 'text/markdown' }),
      new File(['# Kafka'], '0008-kafka.md', { type: 'text/markdown' }),
      new File(['# Шаблон'], 'template.md', { type: 'text/markdown' }),
    ])

    expect(await screen.findByRole('status')).toHaveTextContent('Импортировано: 1. Номер уже занят: 0008-kafka.md.')
    expect(onChanged).toHaveBeenCalled()
    expect(requestsOf(fetchMock, 'POST', decisionsUrl).map((request: { title: string }) => request.title)).toEqual([
      'Pulsar',
      'Kafka',
    ])
    expect(await screen.findByRole('article', { name: 'ADR-0004 Pulsar' })).toBeInTheDocument()
  })
})
