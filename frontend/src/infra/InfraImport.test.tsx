import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MAX_DOCUMENT_SIZE } from '../apiSpec/loadDocument.ts'
import type { CellData } from '../diagram/model.ts'
import { COMPOSE, KUBERNETES, TERRAFORM, type InfraFormat } from './formats.ts'
import { InfraImport } from './InfraImport.tsx'
import { CODRAW_COMPOSE, SHOP_COMPOSE } from './testCompose.ts'
import { BILLING_MANIFESTS, SHOP_MANIFESTS } from './testKubernetes.ts'
import { HCL_CONFIG, MISSING_STATE, RAW_STATE, SECRET_STATE, SHOP_PLAN, SHOP_STATE } from './testTerraform.ts'

function renderImport<Parsed>(format: InfraFormat<Parsed>, { error = null as string | null } = {}) {
  const onAdd = vi.fn<(cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void>()
  const onBack = vi.fn()
  render(<InfraImport format={format} busy={false} error={error} onAdd={onAdd} onBack={onBack} />)
  return { onAdd, onBack, user: userEvent.setup() }
}

const add = () => screen.getByRole('button', { name: 'Добавить на страницу' })
const status = () => screen.getByRole('status')
const shapes = (cells: CellData[]) => cells.filter((cell) => cell.kind === 'vertex' && cell.parent === '1')

describe('InfraImport', () => {
  it('says what it reads and adds nothing before a file is given', () => {
    renderImport(COMPOSE)

    expect(status()).toHaveTextContent('docker-compose.yml или compose.yaml; несколько файлов сливаются, как docker compose -f a.yml -f b.yml')
    expect(screen.getByRole('checkbox', { name: 'Связи по переменным окружения' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Фигуры C4' })).not.toBeChecked()
    expect(add()).toBeDisabled()
  })

  it('sums up the pasted text and adds the cells built for the place it is given', async () => {
    const { onAdd, user } = renderImport(COMPOSE)

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
    const { onAdd, user } = renderImport(COMPOSE)

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
    const { user } = renderImport(COMPOSE)

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
    const { user } = renderImport(COMPOSE)
    const big = new File(['x'], 'big.yml')
    Object.defineProperty(big, 'size', { value: MAX_DOCUMENT_SIZE + 1 })

    await user.upload(screen.getByLabelText('Файлы docker-compose'), [big])

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('big.yml: файл больше 5 МБ'))
    expect(add()).toBeDisabled()
  })

  it('shows why the addition failed and goes back', async () => {
    const { onBack, user } = renderImport(COMPOSE, { error: 'Не удалось добавить схему' })

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось добавить схему')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('InfraImport of Kubernetes', () => {
  const renderKubernetes = () => renderImport(KUBERNETES)

  it('says what it reads', () => {
    renderKubernetes()

    expect(screen.getByRole('heading', { name: 'Импорт Kubernetes' })).toBeInTheDocument()
    expect(status()).toHaveTextContent('Манифесты, вывод helm template или kustomize build — в YAML или JSON')
    expect(add()).toBeDisabled()
  })

  it('sums up the manifests of several files and adds the workloads in the frames of their namespaces', async () => {
    const { onAdd, user } = renderKubernetes()

    await user.upload(screen.getByLabelText('Файлы Kubernetes'), [new File([SHOP_MANIFESTS], 'shop.yaml'), new File([BILLING_MANIFESTS], 'billing.yaml')])
    await waitFor(() =>
      expect(status()).toHaveTextContent('Рабочих нагрузок: 5, шлюзов: 2, внешних сервисов: 1, связей: 7, пространств имён: 2'),
    )
    await user.click(add())

    const cells = await onAdd.mock.lastCall![0]({ x: 0, y: 0 })
    expect(shapes(cells).filter((cell) => cell.style.codrawShape === 'kubernetes-cluster').map((cell) => cell.value)).toEqual(['shop', 'billing'])
    expect(shapes(cells).find((cell) => cell.value.startsWith('postgres'))!.value).toBe('postgres\npostgres:16\nStatefulSet, ×3, :5432')
  })

  it('names a template of Helm', async () => {
    const { user } = renderKubernetes()

    await user.click(screen.getByRole('textbox', { name: 'Манифесты Kubernetes' }))
    await user.paste('kind: Deployment\nspec:\n  replicas: {{ .Values.replicas }}\n')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Текст: это шаблон Helm — выполните helm template и откройте результат'))
    expect(add()).toBeDisabled()
  })
})

describe('InfraImport of Terraform', () => {
  const renderTerraform = () => renderImport(TERRAFORM)
  const warnings = () => screen.getByRole('list', { name: 'Предупреждения' })

  it('says what it reads and how, with no links by variables', async () => {
    const { user } = renderTerraform()

    expect(screen.getByRole('heading', { name: 'Импорт Terraform' })).toBeInTheDocument()
    expect(status()).toHaveTextContent('Вывод terraform show -json: состояния или сохранённого плана')
    expect(screen.queryByRole('checkbox', { name: 'Связи по переменным окружения' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Фигуры C4' })).not.toBeChecked()
    expect(screen.getByLabelText('Файлы Terraform')).toHaveAttribute('accept', '.json')
    await user.click(screen.getByText('Ограничения формата'))
    expect(screen.getByText(/помеченные sensitive не читаются никогда/)).toBeVisible()
    expect(screen.getByText(/Файл — до 20 МБ, за раз — до 300 ресурсов/)).toBeVisible()
    expect(add()).toBeDisabled()
  })

  it('sums up a state, warns of universal shapes and adds the resources in the frames of their modules', async () => {
    const { onAdd, user } = renderTerraform()

    await user.upload(screen.getByLabelText('Файлы Terraform'), [new File([SHOP_STATE], 'state.json')])
    await waitFor(() => expect(status()).toHaveTextContent('Ресурсов: 7, связей: 7, модулей: 1'))
    expect(warnings()).toHaveTextContent('Своей фигуры нет, нарисованы универсальной: aws_vpc, aws_subnet, aws_iam_role')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(add())

    const cells = await onAdd.mock.lastCall![0]({ x: 0, y: 0 })
    expect(shapes(cells).find((cell) => cell.value === 'aws_instance.web\nt3.micro, ×2')!.style.codrawShape).toBe('server')
    expect(shapes(cells).find((cell) => cell.value === 'module.cache')!.style.codrawShape).toBe('boundary')
    expect(JSON.stringify(cells)).not.toContain('hunter2')
  })

  it('warns of what a plan and a state lack, names the files it cannot read, and makes shapes of C4 when asked', async () => {
    const { onAdd } = renderTerraform()
    // «Все файлы» of the dialog of the browser opens files that `accept` does not name.
    const user = userEvent.setup({ applyAccept: false })

    await user.upload(screen.getByLabelText('Файлы Terraform'), [
      new File([RAW_STATE], 'terraform.tfstate'),
      new File([HCL_CONFIG], 'main.tf'),
      new File([SHOP_PLAN], 'plan.json'),
      new File([MISSING_STATE], 'old.json'),
    ])
    await waitFor(() => expect(status()).toHaveTextContent('Ресурсов: 10, связей: 6, модулей: 3, стеков: 2'))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('terraform.tfstate: это файл состояния — выполните terraform show -json и откройте результат')
    expect(alert).toHaveTextContent('main.tf: это конфигурация Terraform — сохраните план или состояние командой terraform show -json')
    expect(warnings()).toHaveTextContent('Своей фигуры нет, нарисованы универсальной: aws_iam_policy, aws_vpc ×2, aws_subnet')
    expect(warnings()).toHaveTextContent('plan.json: план не выводит local.*, связи через них могут отсутствовать: aws_instance.app')
    expect(warnings()).toHaveTextContent('plan.json: план удаляет, на схеме их нет: aws_instance.legacy')
    expect(warnings()).toHaveTextContent('old.json: нет в файле, связи не показаны: aws_instance.web → aws_security_group.legacy')
    await user.click(screen.getByRole('checkbox', { name: 'Фигуры C4' }))
    await user.click(add())

    const cells = await onAdd.mock.lastCall![0]({ x: 0, y: 0 })
    expect(shapes(cells).find((cell) => cell.value.startsWith('aws_rds_cluster.main'))!.style.codrawShape).toBe('c4-database')
    expect(shapes(cells).filter((cell) => cell.style.codrawShape === 'boundary').map((cell) => cell.value)).toEqual([
      'plan.json',
      'module.network',
      'module.app',
      'module.db',
      'old.json',
    ])
  })

  it('reads a file larger than 5 MB, refuses one larger than 20 MB without reading it, and keeps secrets out of the page', async () => {
    const { onAdd, user } = renderTerraform()
    const large = new File([SECRET_STATE], 'large.json')
    Object.defineProperty(large, 'size', { value: MAX_DOCUMENT_SIZE + 1 })
    const huge = new File(['x'], 'huge.json')
    Object.defineProperty(huge, 'size', { value: 4 * MAX_DOCUMENT_SIZE + 1 })

    await user.upload(screen.getByLabelText('Файлы Terraform'), [large, huge])

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('huge.json: файл больше 20 МБ'))
    expect(status()).toHaveTextContent('Ресурсов: 3, связей: 1, модулей: 0')
    await user.click(add())
    const cells = await onAdd.mock.lastCall![0]({ x: 0, y: 0 })
    expect(JSON.stringify(cells)).not.toMatch(/hunter2|db-admin-user|S3cr3t|top-secret-bucket/)
  })
})
