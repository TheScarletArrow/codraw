import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '../test/render.tsx'
import { lazyPage } from '../update/lazyPage.ts'
import { RELOAD_KEY } from '../update/reload.ts'
import { AppError } from './AppError.tsx'

function Broken(): never {
  throw new Error('Сломалось при отрисовке')
}

function Page() {
  return <h1>Доска</h1>
}

describe('AppError', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    sessionStorage.clear()
    // React and the router write the caught error to the console.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  /** Opens a page whose file the server no longer has, as after a deployment. */
  function openStalePage() {
    return renderRoutes([
      {
        path: '/',
        errorElement: <AppError />,
        children: [
          {
            index: true,
            lazy: lazyPage(
              () => Promise.reject<{ Page: typeof Page }>(new TypeError('Failed to fetch dynamically imported module')),
              (module) => module.Page,
            ),
          },
        ],
      },
    ])
  }

  it('shows a page that broke while drawn as «Что-то пошло не так», with a reload', async () => {
    renderRoutes([{ path: '/', element: <Broken />, errorElement: <AppError /> }])

    expect(await screen.findByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Обновить страницу' }))
    expect(reload).toHaveBeenCalled()
  })

  it('reloads a page whose file did not load once by itself', async () => {
    openStalePage()

    expect(await screen.findByText('Загружаем новую версию…')).toBeInTheDocument()
    expect(reload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(RELOAD_KEY)).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Что-то пошло не так' })).not.toBeInTheDocument()
  })

  it('asks to reload by hand when a reload a moment ago did not help', async () => {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    openStalePage()

    expect(await screen.findByRole('heading', { name: 'CoDraw обновился' })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Обновить страницу' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('waits for the connection before it reloads a page that did not load', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    openStalePage()

    expect(await screen.findByRole('heading', { name: 'Нет связи' })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()

    onLine.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(await screen.findByText('Загружаем новую версию…')).toBeInTheDocument()
    expect(reload).toHaveBeenCalledOnce()
  })
})
