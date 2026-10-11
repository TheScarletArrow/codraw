import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaleClient } from './StaleClient.tsx'

describe('StaleClient', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('reloads once in development too, where effects run twice', () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })

    render(
      <StrictMode>
        <StaleClient />
      </StrictMode>,
    )

    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем новую версию…')
  })
})
