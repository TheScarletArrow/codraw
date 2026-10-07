import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { PETSTORE_YAML } from '../apiSpec/testDocuments.ts'
import type { CellData } from '../diagram/model.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { SHOP_COMPOSE } from '../infra/testCompose.ts'
import { SHOP_GRAPH } from '../infra/testGradle.ts'
import { SHOP_MANIFESTS } from '../infra/testKubernetes.ts'
import { downloadBlob } from '../lib/download.ts'
import { createQueryClient } from '../queryClient.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { SqlMenu } from './SqlMenu.tsx'

vi.mock('../lib/download.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/download.ts')>()),
  downloadBlob: vi.fn(),
}))

/** A board whose first page has the tables `users` and `boards`, and an edge from `boards.owner_id` to `users.id`. */
function boardWithTables() {
  const document = new Y.Doc()
  initializeDocument(document)
  const builder = new DiagramBuilder()
  const users = builder.table('users', 40, 40, ['id uuid PK', 'email text NOT NULL'])
  const boards = builder.table('boards', 400, 40, ['id uuid PK', 'owner_id uuid FK NOT NULL'])
  builder.edge(boards.fields[1]!, users.fields[0]!)
  const cells = getCells(document, DEFAULT_PAGE_ID)
  document.transact(() => builder.build().forEach((cell) => writeCell(cells, cell)))
  return document
}

/** The server reads no schemas of databases unless a test says otherwise. */
const SCHEMA_IMPORT_OFF: Record<string, MockResponse | MockResponse[]> = { 'GET /api/schema-import': { status: 404 } }

function renderMenu({ document = boardWithTables(), readOnly = false, responses = SCHEMA_IMPORT_OFF } = {}) {
  const fetchMock = mockFetch(responses)
  const editor = createFakeEditor()
  const queryClient = createQueryClient()
  // Keep the production retry rules, but do not wait between attempts.
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } })
  render(
    <QueryClientProvider client={queryClient}>
      <SqlMenu
        editor={editor}
        document={document}
        pageId={DEFAULT_PAGE_ID}
        boardTitle="Схема"
        pageName="БД"
        pageCount={2}
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  )
  return { editor, document, fetchMock }
}

const menu = () => screen.getByRole('dialog', { name: 'SQL и Mermaid' })

/** The server reads schemas of databases for this user, and answers the import with these responses. */
const schemaImportOn = (imports: MockResponse | MockResponse[] = []) => ({
  'GET /api/schema-import': { body: { maxTables: 500 } },
  'POST /api/schema-import': imports,
})

async function openConnection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
  await user.click(screen.getByRole('button', { name: 'Импорт SQL…' }))
  await user.click(await screen.findByRole('button', { name: 'Подключиться к базе…' }))
}

describe('SqlMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('copies the tables of the page as SQL and as Mermaid', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    expect(menu()).toHaveTextContent('Таблиц на странице: 2')
    await user.click(screen.getByRole('button', { name: 'Скопировать SQL' }))

    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('CREATE TABLE users (\n    id uuid PRIMARY KEY,'))
    expect(writeText).toHaveBeenLastCalledWith(
      expect.stringContaining('ALTER TABLE boards ADD FOREIGN KEY (owner_id) REFERENCES users (id);'),
    )
    expect(await within(menu()).findByText('SQL скопирован')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Скопировать Mermaid' }))
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('users ||--o{ boards : "owner_id"'))
  })

  it('saves the SQL as a file named after the board and the page', async () => {
    renderMenu()

    await userEvent.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await userEvent.click(screen.getByRole('button', { name: 'Скачать .sql' }))

    const [blob, name] = vi.mocked(downloadBlob).mock.lastCall!
    expect(name).toBe('Схема — БД.sql')
    expect(await blob.text()).toContain('CREATE TABLE boards')
  })

  it('offers no export without tables, and no import to a participant who may only view', async () => {
    const empty = new Y.Doc()
    initializeDocument(empty)
    renderMenu({ document: empty, readOnly: true })

    await userEvent.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))

    expect(menu()).toHaveTextContent('Таблиц на странице: 0')
    expect(screen.getByRole('button', { name: 'Скопировать SQL' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Скачать .sql' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Скопировать Mermaid' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Импорт SQL…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Импорт Mermaid…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Импорт OpenAPI / AsyncAPI…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Импорт docker-compose…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Импорт Kubernetes…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Импорт Gradle…' })).toBeNull()
  })

  it('adds the tables of pasted DDL to the right of the page, as one insertion', async () => {
    const user = userEvent.setup()
    const { editor } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт SQL…' }))
    await user.click(screen.getByRole('textbox', { name: 'DDL' }))
    await user.paste(
      'CREATE TABLE teams (id uuid PRIMARY KEY); CREATE TABLE members (team_id uuid REFERENCES teams); CREATE INDEX i ON members (team_id);',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Таблиц: 2, связей: 1, индексов: 1, пропущено операторов: 0')
    await user.click(screen.getByRole('button', { name: 'Добавить на страницу' }))

    await waitFor(() => expect(editor.insertCells).toHaveBeenCalledTimes(1))
    const cells = vi.mocked(editor.insertCells).mock.lastCall![0] as CellData[]
    const teams = cells.find((cell) => cell.value === 'teams')!
    expect(cells.find((cell) => cell.value === 'team_id uuid FK')).toBeDefined()
    expect(cells.find((cell) => cell.value === 'i (team_id)')?.style).toMatchObject({ codrawIndex: true })
    // The page has `boards` from 400 to 620: new tables start 80 to the right of it.
    expect(Math.min(...cells.filter((cell) => cell.parent === '1' && cell.kind === 'vertex').map((cell) => cell.geometry!.x))).toBe(700)
    expect(teams.geometry!.y).toBeGreaterThanOrEqual(40)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reads migrations of Flyway from files in the order of their versions', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт SQL…' }))

    await user.upload(screen.getByLabelText('Файлы SQL'), [
      new File(['ALTER TABLE users ADD COLUMN name text;'], 'V2__name.sql'),
      new File(['CREATE TABLE users (id uuid PRIMARY KEY);'], 'V1__users.sql'),
      new File(['DROP TABLE users;'], 'U1__users.sql'),
    ])

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Таблиц: 1, связей: 0, индексов: 0, пропущено операторов: 0'))
    expect(menu()).toHaveTextContent('Файлов: 3')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('button', { name: 'Импорт SQL…' })).toBeInTheDocument()
  })

  it('adds a flowchart of Mermaid to the right of the page', async () => {
    const user = userEvent.setup()
    const { editor } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт Mermaid…' }))

    await user.click(screen.getByRole('textbox', { name: 'Mermaid' }))
    await user.paste('flowchart LR\n  a[Клиент] --> b(API)\n  subgraph k [Кластер]\n    b\n  end\n  style a fill:#fff')
    expect(screen.getByRole('status')).toHaveTextContent('Узлов: 2, связей: 1, рамок: 1, пропущено строк: 1')
    await user.click(screen.getByRole('button', { name: 'Добавить на страницу' }))

    await waitFor(() => expect(editor.insertCells).toHaveBeenCalledTimes(1))
    const cells = vi.mocked(editor.insertCells).mock.lastCall![0] as CellData[]
    expect(cells.filter((cell) => cell.kind === 'vertex').map((cell) => cell.value)).toEqual(['Кластер', 'Клиент', 'API'])
    expect(Math.min(...cells.filter((cell) => cell.kind === 'vertex').map((cell) => cell.geometry!.x))).toBe(700)
  })

  it('says which kinds of Mermaid it draws', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт Mermaid…' }))
    expect(screen.getByRole('status')).toHaveTextContent('Блок-схема (flowchart, graph) или ER-диаграмма (erDiagram)')

    await user.click(screen.getByRole('textbox', { name: 'Mermaid' }))
    await user.paste('sequenceDiagram\n  A->>B: hi')

    expect(screen.getByRole('alert')).toHaveTextContent('CoDraw рисует из Mermaid блок-схемы (flowchart, graph) и ER-диаграммы')
    expect(screen.getByRole('button', { name: 'Добавить на страницу' })).toBeDisabled()
  })

  it('adds a service and the models of an OpenAPI file to the right of the page, as one insertion', async () => {
    const user = userEvent.setup()
    const { editor } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт OpenAPI / AsyncAPI…' }))

    await user.upload(screen.getByLabelText('Файлы OpenAPI и AsyncAPI'), new File([PETSTORE_YAML], 'petstore.yaml'))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Сервисов: 1, эндпоинтов: 3, топиков: 0, моделей: 2, связей: 2, пропущено ссылок: 0'),
    )
    await user.click(screen.getByRole('button', { name: 'Добавить на страницу' }))

    await waitFor(() => expect(editor.insertCells).toHaveBeenCalledTimes(1))
    const cells = vi.mocked(editor.insertCells).mock.lastCall![0] as CellData[]
    const shapes = cells.filter((cell) => cell.parent === '1' && cell.kind === 'vertex')
    expect(shapes.map((cell) => cell.value)).toEqual(['Petstore\nGET /pets\nPOST /pets\nGET /pets/{petId}', 'Pet', 'Error'])
    expect(Math.min(...shapes.map((cell) => cell.geometry!.x))).toBe(700)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds the services of a docker-compose file to the right of the page, as one insertion', async () => {
    const user = userEvent.setup()
    const { editor } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт docker-compose…' }))

    await user.upload(screen.getByLabelText('Файлы docker-compose'), new File([SHOP_COMPOSE], 'docker-compose.yml'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Сервисов: 3, связей: 2, сетей: 0'))
    await user.click(screen.getByRole('button', { name: 'Добавить на страницу' }))

    await waitFor(() => expect(editor.insertCells).toHaveBeenCalledTimes(1))
    const cells = vi.mocked(editor.insertCells).mock.lastCall![0] as CellData[]
    const shapes = cells.filter((cell) => cell.parent === '1' && cell.kind === 'vertex')
    expect(shapes.map((cell) => cell.value)).toEqual(['postgres\npostgres:18-alpine', 'backend\n./backend', 'frontend\nnginx:1.29\n:8080'])
    expect(Math.min(...shapes.map((cell) => cell.geometry!.x))).toBe(700)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds the workloads of manifests of Kubernetes, and opens each import of infrastructure afresh', async () => {
    const user = userEvent.setup()
    const { editor } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт docker-compose…' }))
    await user.upload(screen.getByLabelText('Файлы docker-compose'), new File([SHOP_COMPOSE], 'docker-compose.yml'))
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    await user.click(screen.getByRole('button', { name: 'Импорт Kubernetes…' }))
    expect(screen.queryByText('Файлов: 1')).toBeNull()

    await user.upload(screen.getByLabelText('Файлы Kubernetes'), new File([SHOP_MANIFESTS], 'shop.yaml'))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Рабочих нагрузок: 4, шлюзов: 1, внешних сервисов: 0, связей: 4, пространств имён: 1'),
    )
    await user.click(screen.getByRole('button', { name: 'Добавить на страницу' }))

    await waitFor(() => expect(editor.insertCells).toHaveBeenCalledTimes(1))
    const cells = vi.mocked(editor.insertCells).mock.lastCall![0] as CellData[]
    expect(cells.find((cell) => cell.value === 'shop' && cell.style.codrawShape === 'kubernetes-cluster')).toBeDefined()
    expect(Math.min(...cells.filter((cell) => cell.kind === 'vertex').map((cell) => cell.geometry!.x))).toBe(700)
  })

  it('adds the modules of a graph of Gradle to the right of the page', async () => {
    const user = userEvent.setup()
    const { editor } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт Gradle…' }))

    await user.upload(screen.getByLabelText('Файлы графа Gradle'), new File([SHOP_GRAPH], 'modules.json'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Модулей: 4, связей: 4, групп: 1, пропущено: 0'))
    await user.click(screen.getByRole('button', { name: 'Добавить на страницу' }))

    await waitFor(() => expect(editor.insertCells).toHaveBeenCalledTimes(1))
    const cells = vi.mocked(editor.insertCells).mock.lastCall![0] as CellData[]
    expect(cells.filter((cell) => cell.style.codrawShape === 'uml-component')).toHaveLength(4)
    expect(Math.min(...cells.filter((cell) => cell.kind === 'vertex').map((cell) => cell.geometry!.x))).toBe(700)
  })

  it('cannot add anything until the DDL has a table', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт SQL…' }))

    await user.click(screen.getByRole('textbox', { name: 'DDL' }))
    await user.paste('SELECT 1;')

    expect(screen.getByRole('button', { name: 'Добавить на страницу' })).toBeDisabled()
  })

  it('says how to take the schema of a database to a file, and offers no connection when the server has it off', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт SQL…' }))

    expect(menu()).toHaveTextContent('Схему готовой базы снимает pg_dump --schema-only или mysqldump --no-data: откройте полученный файл.')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/schema-import', expect.anything()))
    expect(screen.queryByRole('button', { name: 'Подключиться к базе…' })).toBeNull()
  })

  it('tells a guest that connections to databases are for those who signed in', async () => {
    const user = userEvent.setup()
    renderMenu({ responses: { 'GET /api/schema-import': { status: 403, body: { reason: 'sign-in-required' } } } })
    await user.click(screen.getByRole('button', { name: 'SQL и Mermaid' }))
    await user.click(screen.getByRole('button', { name: 'Импорт SQL…' }))

    expect(await within(menu()).findByText(/Подключиться к базе можно после входа через GitHub или Google/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Подключиться к базе…' })).toBeNull()
  })

  it('reads the schema of a database into the field of DDL, from a connection string and a password', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderMenu({
      responses: schemaImportOn({ body: { ddl: 'CREATE TABLE users (id bigserial PRIMARY KEY);\nCREATE TABLE orders (user_id bigint REFERENCES users);', tables: 2 } }),
    })
    await openConnection(user)

    await user.click(screen.getByRole('textbox', { name: 'Строка подключения' }))
    await user.paste('postgresql://reader@db.internal:5432/shop?sslmode=require&connect_timeout=3')
    expect(screen.getByRole('textbox', { name: 'Хост' })).toHaveValue('db.internal')
    expect(screen.getByRole('textbox', { name: 'Порт' })).toHaveValue('5432')
    expect(screen.getByRole('textbox', { name: 'База' })).toHaveValue('shop')
    expect(screen.getByRole('textbox', { name: 'Схема' })).toHaveValue('public')
    expect(screen.getByRole('textbox', { name: 'Пользователь' })).toHaveValue('reader')
    expect(screen.getByRole('combobox', { name: 'SSL' })).toHaveValue('require')
    expect(menu()).toHaveTextContent('Только PostgreSQL, не больше 500 таблиц схемы.')
    await user.type(screen.getByLabelText('Пароль'), 's3cret')
    await user.click(screen.getByRole('button', { name: 'Загрузить схему' }))

    expect(await screen.findByRole('textbox', { name: 'DDL' })).toHaveValue(
      'CREATE TABLE users (id bigserial PRIMARY KEY);\nCREATE TABLE orders (user_id bigint REFERENCES users);',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Таблиц: 2, связей: 1, индексов: 0, пропущено операторов: 0')
    expect(screen.queryByLabelText('Пароль')).toBeNull()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      host: 'db.internal',
      port: 5432,
      database: 'shop',
      user: 'reader',
      password: 's3cret',
      schema: 'public',
      sslMode: 'require',
    })
  })

  it('names why the schema did not load and keeps the connection open', async () => {
    const user = userEvent.setup()
    renderMenu({
      responses: schemaImportOn([
        { status: 422, body: { reason: 'authentication-failed' } },
        { status: 422, body: { reason: 'too-large', limit: 500 } },
        { status: 403, body: { reason: 'host-not-allowed' } },
        { status: 429 },
      ]),
    })
    await openConnection(user)
    await user.type(screen.getByRole('textbox', { name: 'Хост' }), 'db.internal')
    await user.type(screen.getByRole('textbox', { name: 'База' }), 'shop')
    expect(screen.getByRole('button', { name: 'Загрузить схему' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Пользователь' }), 'reader')

    for (const message of [
      'Неверная база, пользователь или пароль',
      'В схеме больше 500 таблиц — столько за раз не загрузить',
      'Администратор CoDraw не разрешил подключаться к этому адресу',
      'Слишком много попыток подключения, попробуйте позже',
    ]) {
      await user.click(screen.getByRole('button', { name: 'Загрузить схему' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    }
    expect(screen.getByRole('heading', { name: 'Подключение к базе' })).toBeInTheDocument()
  })

  it('forgets the password when the window closes, and keeps it nowhere', async () => {
    const user = userEvent.setup()
    renderMenu({ responses: schemaImportOn() })
    await openConnection(user)
    await user.type(screen.getByLabelText('Пароль'), 's3cret')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await openConnection(user)

    expect(screen.getByLabelText('Пароль')).toHaveValue('')
    expect(JSON.stringify({ ...localStorage })).not.toContain('s3cret')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('textbox', { name: 'DDL' })).toBeInTheDocument()
  })
})
