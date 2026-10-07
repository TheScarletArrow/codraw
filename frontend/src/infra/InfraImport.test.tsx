import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MAX_DOCUMENT_SIZE } from '../apiSpec/loadDocument.ts'
import type { CellData } from '../diagram/model.ts'
import { InfraImport } from './InfraImport.tsx'
import { CODRAW_COMPOSE, SHOP_COMPOSE } from './testCompose.ts'

function renderImport({ error = null as string | null } = {}) {
  const onAdd = vi.fn<(cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void>()
  const onBack = vi.fn()
  render(<InfraImport busy={false} error={error} onAdd={onAdd} onBack={onBack} />)
  return { onAdd, onBack, user: userEvent.setup() }
}

const add = () => screen.getByRole('button', { name: 'Добавить на страницу' })
const status = () => screen.getByRole('status')
const shapes = (cells: CellData[]) => cells.filter((cell) => cell.kind === 'vertex' && cell.parent === '1')

describe('InfraImport', () => {
  it('says what it reads and adds nothing before a file is given', () => {
    renderImport()

    expect(status()).toHaveTextContent('docker-compose.yml или compose.yaml; несколько файлов сливаются, как docker compose -f a.yml -f b.yml')
    expect(screen.getByRole('checkbox', { name: 'Связи по переменным окружения' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Фигуры C4' })).not.toBeChecked()
    expect(add()).toBeDisabled()
  })

  it('sums up the pasted text and adds the cells built for the place it is given', async () => {
    const { onAdd, user } = renderImport()

    await user.click(screen.getByRole('textbox', { name: 'docker-compose' }))
    await user.paste(SHOP_COMPOSE)
    expect(status()).toHaveTextContent('Разбор…')
    expect(add()).toBeDisabled()
    await waitFor(() => expect(status()).toHaveTextContent('Сервисов: 3, связей: 2, сетей: 0'))
    await user.click(add())

    expect(onAdd).toHaveBeenCalledTimes(1)
    const cells = await onAdd.mock.lastCall![0]({ x: 300, y: 20 })
    expect(shapes(cells).map((cell) => cell.value)).toEqual(['postgres\npostgres:18-alpine', 'backend\n./backend', 'frontend\nnginx:1.29\n:8080'])
    expect(Math.min(...shapes(cells).map((cell) => cell.geometry!.x))).toBe(300)
  })

  it('merges the files with the text, counts links without variables and makes shapes of C4 when asked', async () => {
    const { onAdd, user } = renderImport()

    await user.upload(screen.getByLabelText('Файлы docker-compose'), [new File([CODRAW_COMPOSE], 'docker-compose.prod.yml')])
    await waitFor(() => expect(status()).toHaveTextContent('Сервисов: 6, связей: 7, сетей: 0'))
    expect(screen.getByText('Файлов: 1')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Связи по переменным окружения' }))
    expect(status()).toHaveTextContent('Сервисов: 6, связей: 7, сетей: 0')
    await user.click(screen.getByRole('textbox', { name: 'docker-compose' }))
    await user.paste('services:\n  redis:\n    image: redis:8\n  backend:\n    depends_on: [redis]\n')
    await waitFor(() => expect(status()).toHaveTextContent('Сервисов: 7, связей: 8, сетей: 0'))
    await user.click(screen.getByRole('checkbox', { name: 'Фигуры C4' }))
    await user.click(add())

    const cells = await onAdd.mock.lastCall![0]({ x: 0, y: 0 })
    expect(shapes(cells).map((cell) => cell.style.codrawShape)).toEqual([
      'c4-database',
      'c4-container',
      'c4-container',
      'c4-container',
      'c4-container',
      'c4-container',
      'c4-container',
    ])
    expect(cells.filter((cell) => cell.kind === 'edge').every((edge) => edge.value === '')).toBe(true)
  })

  it('names the files it cannot read and adds the others', async () => {
    const { user } = renderImport()

    await user.upload(screen.getByLabelText('Файлы docker-compose'), [
      new File(['openapi: 3.0.3\n'], 'openapi.yaml'),
      new File(['services:\n  app:\n   image: a\n    ports: []\n'], 'broken.yml'),
      new File([SHOP_COMPOSE], 'compose.yaml'),
    ])

    await waitFor(() => expect(status()).toHaveTextContent('Сервисов: 3, связей: 2, сетей: 0'))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('openapi.yaml: это не docker-compose — нет раздела services')
    expect(alert).toHaveTextContent(/broken\.yml: строка 3, столбец \d+ — /)
    expect(add()).toBeEnabled()
  })

  it('refuses a file larger than the limit without reading it', async () => {
    const { user } = renderImport()
    const big = new File(['x'], 'big.yml')
    Object.defineProperty(big, 'size', { value: MAX_DOCUMENT_SIZE + 1 })

    await user.upload(screen.getByLabelText('Файлы docker-compose'), [big])

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('big.yml: файл больше 5 МБ'))
    expect(add()).toBeDisabled()
  })

  it('shows why the addition failed and goes back', async () => {
    const { onBack, user } = renderImport({ error: 'Не удалось добавить схему' })

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось добавить схему')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
