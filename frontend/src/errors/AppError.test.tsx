import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '../test/render.tsx'
import { AppError } from './AppError.tsx'

function Broken(): never {
  throw new Error('Сломалось при отрисовке')
}

describe('AppError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a page that broke while drawn as «Что-то пошло не так», with a reload', async () => {
    // React and the router write the caught error to the console.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
    renderRoutes([{ path: '/', element: <Broken />, errorElement: <AppError /> }])

    expect(await screen.findByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Обновить страницу' }))
    expect(reload).toHaveBeenCalled()
  })
})
