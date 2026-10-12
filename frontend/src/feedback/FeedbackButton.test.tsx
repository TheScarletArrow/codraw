import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { version } from '../../package.json'
import { Layout } from '../Layout.tsx'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'

const routes = [
  { path: '/login', element: <p>Страница входа</p> },
  { path: '/', element: <Layout />, children: [{ path: 'boards/:boardId', element: <p>Холст</p> }] },
]

function renderBoard(feedback: MockResponse | MockResponse[] = { status: 204 }, user = ALICE) {
  const fetchMock = mockFetch({
    'GET /api/me': { body: user },
    'GET /api/notifications/unread-count': { body: { count: 0 } },
    'POST /api/feedback': feedback,
  })
  renderRoutes(routes, '/boards/42?page=p1')
  return fetchMock
}

const feedbackButton = async () => within(await screen.findByRole('banner')).findByRole('button', { name: 'Обратная связь' })

const sent = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls
    .filter(([input, init]) => input.toString() === '/api/feedback' && init?.method === 'POST')
    .map(([, init]) => JSON.parse(init!.body as string) as unknown)

describe('FeedbackButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the kind and the text with the page without its query and the version of the app, which the window names', async () => {
    const fetchMock = renderBoard()

    await userEvent.click(await feedbackButton())

    const window = screen.getByRole('dialog', { name: 'Обратная связь' })
    expect(window).toHaveTextContent(`страница /boards/42, версия CoDraw ${version} и браузер`)
    expect(within(window).getByRole('radio', { name: 'Ошибка' })).toBeChecked()
    expect(within(window).getByRole('button', { name: 'Отправить' })).toBeDisabled()
    await userEvent.click(within(window).getByRole('radio', { name: 'Идея' }))
    await userEvent.type(within(window).getByRole('textbox', { name: 'Сообщение' }), '  Экспорт в PlantUML ')
    await userEvent.click(within(window).getByRole('button', { name: 'Отправить' }))

    expect(await within(window).findByRole('status')).toHaveTextContent('Спасибо! Отзыв отправлен.')
    expect(sent(fetchMock)).toEqual([{ kind: 'idea', text: 'Экспорт в PlantUML', page: '/boards/42', appVersion: version }])
  })

  it('opens with an empty form again after the thanks', async () => {
    renderBoard()
    const button = await feedbackButton()
    await userEvent.click(button)
    await userEvent.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Спасибо за CoDraw')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Спасибо!')

    await userEvent.click(button)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Обратная связь' })).toBeNull())
    await userEvent.click(button)

    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('')
  })

  it('keeps a text not sent yet when the window closes', async () => {
    const fetchMock = renderBoard()
    const button = await feedbackButton()
    await userEvent.click(button)
    await userEvent.click(screen.getByRole('radio', { name: 'Другое' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Черновик отзыва')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Обратная связь' })).toBeNull())
    await userEvent.click(button)

    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('Черновик отзыва')
    expect(screen.getByRole('radio', { name: 'Другое' })).toBeChecked()
    expect(sent(fetchMock)).toEqual([])
  })

  it('tells when there was too much feedback, and when it could not be sent', async () => {
    renderBoard([{ status: 429, body: { title: 'Too Many Requests' } }, { status: 500 }])
    await userEvent.click(await feedbackButton())
    await userEvent.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Ошибка')

    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много отзывов. Попробуйте позже.')

    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить отзыв. Попробуйте ещё раз.'))
    // The text stays for another try.
    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('Ошибка')
  })

  it('is in the header of a guest too', async () => {
    renderBoard({ status: 204 }, { ...ALICE, guest: true })

    expect(await feedbackButton()).toBeInTheDocument()
  })

  it('opens from «Тема», where a phone offers it, and stays open with the focus in it', async () => {
    renderBoard()
    await userEvent.click(await screen.findByRole('button', { name: /^Тема:/ }))

    await userEvent.click(within(screen.getByRole('dialog', { name: 'Тема' })).getByRole('button', { name: 'Обратная связь' }))

    const window = await screen.findByRole('dialog', { name: 'Обратная связь' })
    expect(screen.queryByRole('dialog', { name: 'Тема' })).toBeNull()
    await waitFor(() => expect(window).toContainElement(document.activeElement as HTMLElement))
    // The menu gives the focus back to its button a moment after it closes, which would close the window.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('dialog', { name: 'Обратная связь' })).toContainElement(document.activeElement as HTMLElement)
  })
})
