import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImageUploadError, ImageUploadProgress } from './ImageUploadStatus.tsx'

describe('the lines of uploads of images', () => {
  it('tell how much of the images went, and nothing without uploads', () => {
    const { rerender, container } = render(<ImageUploadProgress state={{ count: 1, progress: 0.404, error: null }} />)
    expect(screen.getByText('Загрузка изображения… 40%')).toBeInTheDocument()

    rerender(<ImageUploadProgress state={{ count: 3, progress: 0.5, error: null }} />)
    expect(screen.getByText('Загрузка изображений (3)… 50%')).toBeInTheDocument()

    rerender(<ImageUploadProgress state={{ count: 0, progress: 0, error: 'Не удалось загрузить изображение' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('tell why an image was not added until the participant dismisses it', async () => {
    const dismiss = vi.fn()
    render(<ImageUploadError state={{ count: 0, progress: 0, error: 'Изображение больше 10 МБ' }} onDismiss={dismiss} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Изображение больше 10 МБ')
    await userEvent.click(screen.getByRole('button', { name: 'Понятно' }))
    expect(dismiss).toHaveBeenCalled()
  })
})
