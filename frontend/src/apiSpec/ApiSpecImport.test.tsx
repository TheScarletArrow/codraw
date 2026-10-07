import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CellData } from '../diagram/model.ts'
import { ApiSpecImport } from './ApiSpecImport.tsx'
import { MAX_DOCUMENT_SIZE } from './loadDocument.ts'
import { BILLING_ASYNCAPI_YAML, ORDERS_ASYNCAPI_YAML, PETSTORE_YAML } from './testDocuments.ts'

function renderImport({ error = null as string | null } = {}) {
  const onAdd = vi.fn<(cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void>()
  const onBack = vi.fn()
  render(<ApiSpecImport busy={false} error={error} onAdd={onAdd} onBack={onBack} />)
  return { onAdd, onBack, user: userEvent.setup() }
}

const add = () => screen.getByRole('button', { name: 'Добавить на страницу' })
const status = () => screen.getByRole('status')

describe('ApiSpecImport', () => {
  it('says what it reads and adds nothing before a document is given', () => {
    renderImport()

    expect(status()).toHaveTextContent('OpenAPI 3 или Swagger 2.0, AsyncAPI 2 или 3 — в YAML или JSON')
    expect(screen.getByRole('checkbox', { name: 'Модели таблицами' })).toBeChecked()
    expect(add()).toBeDisabled()
  })

  it('sums up the pasted text and adds the cells built for the place it is given', async () => {
    const { onAdd, user } = renderImport()

    await user.click(screen.getByRole('textbox', { name: 'OpenAPI или AsyncAPI' }))
    await user.paste(PETSTORE_YAML)
    expect(status()).toHaveTextContent('Разбор…')
    expect(add()).toBeDisabled()
    await waitFor(() => expect(status()).toHaveTextContent('Сервисов: 1, эндпоинтов: 3, топиков: 0, моделей: 2, связей: 2, пропущено ссылок: 0'))
    await user.click(add())

    expect(onAdd).toHaveBeenCalledTimes(1)
    const cells = await onAdd.mock.lastCall![0]({ x: 300, y: 20 })
    expect(cells.filter((cell) => cell.kind === 'vertex' && cell.parent === '1').map((cell) => cell.geometry!.x)).toContain(300)
  })

  it('leaves the models out without «Модели таблицами»', async () => {
    const { user } = renderImport()
    await user.click(screen.getByRole('textbox', { name: 'OpenAPI или AsyncAPI' }))
    await user.paste(PETSTORE_YAML)
    await waitFor(() => expect(status()).toHaveTextContent('моделей: 2'))

    await user.click(screen.getByRole('checkbox', { name: 'Модели таблицами' }))

    expect(status()).toHaveTextContent('Сервисов: 1, эндпоинтов: 3, топиков: 0, моделей: 0, связей: 0, пропущено ссылок: 0')
  })

  it('reads several files with the text, and adds those that parse while showing why the others do not', async () => {
    const { user } = renderImport()

    await user.upload(screen.getByLabelText('Файлы OpenAPI и AsyncAPI'), [
      new File([ORDERS_ASYNCAPI_YAML], 'orders.yaml'),
      new File([BILLING_ASYNCAPI_YAML], 'billing.yml'),
      new File(['openapi: 3.0.0\ninfo:\n  title: A\n title: B\n'], 'broken.yaml'),
    ])
    await user.click(screen.getByRole('textbox', { name: 'OpenAPI или AsyncAPI' }))
    await user.paste('title: notes')

    await waitFor(() => expect(status()).toHaveTextContent('Сервисов: 2, эндпоинтов: 0, топиков: 3, моделей: 2, связей: 5'))
    expect(screen.getByText('Файлов: 3')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/broken\.yaml: строка 4, столбец \d+ — /)
    expect(alert).toHaveTextContent('Текст: это не OpenAPI и не AsyncAPI — нет поля openapi, swagger или asyncapi')
    expect(add()).toBeEnabled()
  })

  it('cannot add while only errors are left', async () => {
    const { user } = renderImport()

    await user.upload(screen.getByLabelText('Файлы OpenAPI и AsyncAPI'), new File(['just text'], 'notes.json'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('notes.json: это не OpenAPI и не AsyncAPI'))
    expect(screen.queryByRole('status')).toBeNull()
    expect(add()).toBeDisabled()
  })

  it('refuses a file larger than the limit without reading it', async () => {
    const { user } = renderImport()
    const huge = new File(['{}'], 'huge.yaml')
    Object.defineProperty(huge, 'size', { value: MAX_DOCUMENT_SIZE + 1 })
    const read = vi.spyOn(huge, 'text')

    await user.upload(screen.getByLabelText('Файлы OpenAPI и AsyncAPI'), huge)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('huge.yaml: файл больше 5 МБ'))
    expect(read).not.toHaveBeenCalled()
  })

  it('shows why the last addition failed and goes back', async () => {
    const { onBack, user } = renderImport({ error: 'Не удалось добавить схему' })

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось добавить схему')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onBack).toHaveBeenCalled()
  })
})
