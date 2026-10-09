import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Database } from 'lucide-react'
import { useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createProposal, proposalLimitOf, type Proposal } from '../api/proposals.ts'
import { fetchSchemaImport } from '../api/schemaImport.ts'
import { ApiSpecImport } from '../apiSpec/ApiSpecImport.tsx'
import { ArchitectureExport } from '../architecture/ArchitectureExport.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { getCells, readCell, type CellData } from '../diagram/model.ts'
import { COMPOSE, KUBERNETES, TERRAFORM } from '../infra/formats.ts'
import { GradleImport } from '../infra/GradleImport.tsx'
import { InfraImport } from '../infra/InfraImport.tsx'
import { downloadBlob, fileName } from '../lib/download.ts'
import { mermaidCells, mermaidSummary } from '../mermaid/mermaidCells.ts'
import { MermaidError, parseMermaid, type MermaidDiagram } from '../mermaid/parseMermaid.ts'
import { setPendingSchemaImportUpdate, summarizeSchemaUpdate } from '../proposals/schemaImportUpdate.ts'
import { DatabaseConnection } from './DatabaseConnection.tsx'
import { diagramSchema, placeBeside, schemaCells, schemaMermaid, schemaSql } from './erDiagram.ts'
import { parseSql, parseSqlFiles, type SqlFile, type SqlSchema } from './parseSql.ts'

interface SqlMenuProps {
  editor: DiagramEditor | null
  document: Y.Doc | null
  pageId: string | null
  boardTitle: string
  pageName: string
  pageCount: number
  /** A participant who may only view exports, but does not import. */
  readOnly: boolean
  /** The board whose page is open; absent in a proposal draft. */
  boardId?: string
  /** Called after an import has opened a proposal. */
  onProposalCreated?: (proposal: Proposal) => void
}

type Message = 'sql-copied' | 'mermaid-copied' | 'copy-failed' | 'import-failed' | 'proposal-failed' | 'proposal-limit-author' | 'proposal-limit-board'

const MESSAGES: Record<Message, string> = {
  'sql-copied': 'SQL скопирован',
  'mermaid-copied': 'Mermaid скопирован',
  'copy-failed': 'Не удалось скопировать',
  'import-failed': 'Не удалось добавить схему',
  'proposal-failed': 'Не удалось создать предложение',
  'proposal-limit-author': 'У вас уже предельное число открытых предложений на этой доске',
  'proposal-limit-board': 'На доске уже предельное число открытых предложений',
}

/** The cells of a page, as its document has them. */
function pageCells(document: Y.Doc, pageId: string): CellData[] {
  return Array.from(getCells(document, pageId).entries(), ([id, cell]) => readCell(id, cell))
}

/** The schema of DDL from the opened files, in the order of migrations, then from the text. */
function importedSchema(files: SqlFile[], text: string): SqlSchema {
  return parseSql(text, parseSqlFiles(files))
}

/** The diagram of Mermaid in the text, or why there is none. */
function importedDiagram(text: string): { diagram: MermaidDiagram | null; error: string | null } {
  if (text.trim() === '') return { diagram: null, error: null }
  try {
    const diagram = parseMermaid(text)
    const empty =
      diagram.kind === 'flowchart'
        ? diagram.nodes.length === 0
        : diagram.kind === 'er'
          ? diagram.tables.length === 0
          : diagram.diagram.participants.length === 0
    return { diagram: empty ? null : diagram, error: empty ? 'В тексте нет ни одного узла, таблицы или участника' : null }
  } catch (error) {
    if (error instanceof MermaidError) return { diagram: null, error: error.message }
    throw error
  }
}

const countReferences = (schema: SqlSchema) =>
  schema.tables.reduce((sum, table) => sum + table.foreignKeys.reduce((keys, key) => keys + key.columns.length, 0), 0)

const countIndexes = (schema: SqlSchema) =>
  [...schema.tables, ...schema.views].reduce((sum, relation) => sum + relation.indexes.length, 0)

/** What an import of SQL finds: tables, views when it has them, references and indexes. */
const importSummary = (schema: SqlSchema) =>
  [
    `Таблиц: ${schema.tables.length}`,
    schema.views.length > 0 && `представлений: ${schema.views.length}`,
    `связей: ${countReferences(schema)}`,
    `индексов: ${countIndexes(schema)}`,
  ]
    .filter(Boolean)
    .join(', ')

type CellFactory = (origin: { x: number; y: number }) => Promise<CellData[]>

const sourceTitle = (files: { name: string }[], fallback: string) =>
  files.length === 1 ? files[0]!.name : files.length > 1 ? `${files.length} файлов` : fallback

function proposalDescription(pageName: string, summary: string, existing: CellData[], imported: CellData[]): string {
  const update = summarizeSchemaUpdate(existing, imported)
  const lines = [
    `Страница: ${pageName}`,
    summary,
    `Совпало: ${update.changed}, новых элементов: ${update.added}, к удалению: ${update.removed}.`,
    update.matchedByName.length > 0 && `Без метки источника сопоставлено по имени: ${update.matchedByName.join(', ')}.`,
  ].filter(Boolean)
  return lines.join('\n').slice(0, 2000)
}

/**
 * Tables of a database in and out of the current page: DDL becomes an ER diagram, the diagram becomes DDL or Mermaid;
 * a flowchart, an ER diagram or a sequence diagram of Mermaid, documents of OpenAPI and AsyncAPI, files of docker-compose, manifests of
 * Kubernetes, builds of Gradle and states and plans of Terraform become a diagram of the page.
 */
export function SqlMenu({
  editor,
  document: doc,
  pageId,
  boardTitle,
  pageName,
  pageCount,
  readOnly,
  boardId,
  onProposalCreated,
}: SqlMenuProps) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState<'sql' | 'mermaid' | 'api' | 'compose' | 'kubernetes' | 'gradle' | 'terraform' | null>(null)
  // «Подключение к базе» over «Импорт SQL».
  const [connecting, setConnecting] = useState(false)
  // «Архитектура как код» over the menu.
  const [exporting, setExporting] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<SqlFile[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const schema = open && doc && pageId ? diagramSchema(pageCells(doc, pageId)) : null
  const tables = schema?.tables.length ?? 0
  const views = schema?.views.length ?? 0
  // A schema of views alone is SQL, but no erDiagram of Mermaid.
  const exportable = tables + views > 0
  const imported = importing === 'sql' ? importedSchema(files, text) : null
  const importable = imported !== null && imported.tables.length + imported.views.length > 0
  const mermaid = importing === 'mermaid' ? importedDiagram(text) : null
  // Whether the server reads schemas of databases for this user; asked when «Импорт SQL» opens.
  const schemaImport = useQuery({ queryKey: ['schema-import'], queryFn: fetchSchemaImport, enabled: importing === 'sql', staleTime: 5 * 60_000 })
  const importError = message && message !== 'sql-copied' && message !== 'mermaid-copied' ? MESSAGES[message] : null

  const reset = () => {
    setImporting(null)
    setConnecting(false)
    setExporting(false)
    setText('')
    setFiles([])
    setMessage(null)
  }

  const copy = async (content: string, done: Message) => {
    try {
      await navigator.clipboard.writeText(content)
      setMessage(done)
    } catch {
      setMessage('copy-failed')
    }
  }

  const openFiles = async (list: FileList | null) => {
    if (!list) return
    setFiles(await Promise.all(Array.from(list, async (file) => ({ name: file.name, text: await file.text() }))))
  }

  /** Adds the cells built to the right of what the page has, as one undo step, and closes the menu. */
  const insert = async (cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => {
    if (!editor || !doc || !pageId) return
    setBusy(true)
    try {
      editor.insertCells(await cells(placeBeside(pageCells(doc, pageId))))
      setOpen(false)
      reset()
    } catch {
      setMessage('import-failed')
    } finally {
      setBusy(false)
    }
  }

  /** Creates a proposal, and lets its draft page apply the imported cells once it connects. */
  const proposeUpdate = async (source: string, summary: string, cells: CellFactory) => {
    if (!doc || !pageId || !boardId || !onProposalCreated) return
    setBusy(true)
    try {
      const existing = pageCells(doc, pageId)
      const imported = await cells(placeBeside(existing))
      const proposal = await createProposal(boardId, `Обновление из ${source}`, proposalDescription(pageName, summary, existing, imported))
      setPendingSchemaImportUpdate(proposal.id, { pageId, cells: imported })
      setOpen(false)
      reset()
      onProposalCreated(proposal)
    } catch (error) {
      const limit = proposalLimitOf(error)
      setMessage(limit?.scope === 'author' ? 'proposal-limit-author' : limit?.scope === 'board' ? 'proposal-limit-board' : 'proposal-failed')
    } finally {
      setBusy(false)
    }
  }

  /** What the windows of the imports of infrastructure share. */
  const infraProps = (prefix: string, fallback: string) => ({
    busy,
    error: importError,
    onBack: reset,
    onAdd: (cells: CellFactory) => void insert(cells),
    onUpdate: boardId && onProposalCreated ? (source: string, summary: string, cells: CellFactory) => void proposeUpdate(sourceTitle([{ name: source }], fallback), summary, cells) : undefined,
    sourcePrefix: prefix,
  })

  const addTables = () => {
    const diagram = mermaid?.diagram
    if (imported && importable) void insert((origin) => schemaCells(imported, origin, undefined, [], 'sql'))
    else if (diagram) void insert((origin) => mermaidCells(diagram, origin, undefined, 'mermaid'))
  }

  const updateTables = () => {
    const diagram = mermaid?.diagram
    if (imported && importable) {
      void proposeUpdate(sourceTitle(files, 'SQL'), importSummary(imported), (origin) =>
        schemaCells(imported, origin, undefined, [], 'sql'),
      )
    } else if (diagram) {
      void proposeUpdate('Mermaid', mermaidSummary(diagram), (origin) => mermaidCells(diagram, origin, undefined, 'mermaid'))
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="SQL и Mermaid"
          title="SQL и Mermaid: импорт и выгрузка схем, импорт OpenAPI, AsyncAPI, docker-compose, Kubernetes, Gradle и Terraform, архитектура как код"
          disabled={!doc || !pageId}
        >
          <Database />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="SQL и Mermaid"
        className={importing || exporting ? 'flex w-[28rem] flex-col gap-2' : 'flex w-64 flex-col gap-1 p-2'}
      >
        {exporting && doc && pageId ? (
          <ArchitectureExport cells={pageCells(doc, pageId)} title={pageCount > 1 ? `${boardTitle} — ${pageName}` : boardTitle} onBack={reset} />
        ) : importing === 'api' ? (
          <ApiSpecImport
            busy={busy}
            error={importError}
            onBack={reset}
            onAdd={(cells) => void insert(cells)}
            onUpdate={boardId && onProposalCreated ? (source, summary, cells) => void proposeUpdate(source, summary, cells) : undefined}
          />
        ) : importing === 'compose' ? (
          <InfraImport format={COMPOSE} {...infraProps('compose', 'docker-compose')} />
        ) : importing === 'kubernetes' ? (
          <InfraImport format={KUBERNETES} {...infraProps('kubernetes', 'Kubernetes')} />
        ) : importing === 'gradle' ? (
          <GradleImport {...infraProps('gradle', 'Gradle')} />
        ) : importing === 'terraform' ? (
          <InfraImport format={TERRAFORM} {...infraProps('terraform', 'Terraform')} />
        ) : importing === 'mermaid' && mermaid ? (
          <>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Назад" onClick={reset}>
                <ArrowLeft />
              </Button>
              <h2 className="text-sm font-semibold">Импорт Mermaid</h2>
            </div>
            <textarea
              aria-label="Mermaid"
              placeholder={'flowchart LR\n  client[Клиент] -->|HTTPS| api(API)\n  api --> db[(PostgreSQL)]'}
              rows={8}
              spellCheck={false}
              className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            {mermaid.error ? (
              <p role="alert" className="text-xs text-destructive">
                {mermaid.error}
              </p>
            ) : (
              <p role="status" className="text-xs text-muted-foreground">
                {mermaid.diagram
                  ? mermaidSummary(mermaid.diagram)
                  : 'Блок-схема (flowchart, graph), ER-диаграмма (erDiagram) или диаграмма последовательности (sequenceDiagram)'}
              </p>
            )}
            {message && (
              <p role="alert" className="text-xs text-destructive">
                {MESSAGES[message]}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy || !mermaid.diagram} onClick={addTables}>
                Добавить на страницу
              </Button>
              {boardId && onProposalCreated && (
                <Button type="button" variant="outline" size="sm" disabled={busy || !mermaid.diagram} onClick={updateTables}>
                  Обновить через предложение
                </Button>
              )}
            </div>
          </>
        ) : importing === 'sql' && connecting && schemaImport.data?.kind === 'available' ? (
          <DatabaseConnection
            maxTables={schemaImport.data.maxTables}
            onBack={() => setConnecting(false)}
            onLoaded={(ddl) => {
              setText(ddl)
              setFiles([])
              setConnecting(false)
            }}
          />
        ) : importing === 'sql' && imported ? (
          <>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Назад" onClick={reset}>
                <ArrowLeft />
              </Button>
              <h2 className="text-sm font-semibold">Импорт SQL</h2>
            </div>
            <textarea
              aria-label="DDL"
              placeholder={'CREATE TABLE users (\n  id uuid PRIMARY KEY,\n  email text NOT NULL\n);'}
              rows={8}
              spellCheck={false}
              className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
                Открыть файлы .sql
              </Button>
              <input
                ref={input}
                type="file"
                accept=".sql,text/plain"
                multiple
                hidden
                aria-label="Файлы SQL"
                onChange={(event) => void openFiles(event.target.files)}
              />
              {files.length > 0 && (
                <span className="truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(', ')}>
                  Файлов: {files.length}
                </span>
              )}
              {schemaImport.data?.kind === 'available' && (
                <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setConnecting(true)}>
                  Подключиться к базе…
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Схему готовой базы снимает <code>pg_dump --schema-only</code> или <code>mysqldump --no-data</code>: откройте
              полученный файл.
              {schemaImport.data?.kind === 'sign-in' && ' Подключиться к базе можно после входа через GitHub или Google.'}
            </p>
            <p role="status" className="text-xs text-muted-foreground">
              {importSummary(imported)}, пропущено операторов: {imported.skipped}
            </p>
            {message && (
              <p role="alert" className="text-xs text-destructive">
                {MESSAGES[message]}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy || !importable} onClick={addTables}>
                Добавить на страницу
              </Button>
              {boardId && onProposalCreated && (
                <Button type="button" variant="outline" size="sm" disabled={busy || !importable} onClick={updateTables}>
                  Обновить через предложение
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Таблиц на странице: {tables}
              {views > 0 && `, представлений: ${views}`}
            </p>
            {!readOnly && (
              <>
                <Button type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setImporting('sql')}>
                  Импорт SQL…
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onClick={() => setImporting('mermaid')}
                >
                  Импорт Mermaid…
                </Button>
                <Button type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setImporting('api')}>
                  Импорт OpenAPI / AsyncAPI…
                </Button>
                <Button type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setImporting('compose')}>
                  Импорт docker-compose…
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onClick={() => setImporting('kubernetes')}
                >
                  Импорт Kubernetes…
                </Button>
                <Button type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setImporting('gradle')}>
                  Импорт Gradle…
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onClick={() => setImporting('terraform')}
                >
                  Импорт Terraform…
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              disabled={!exportable}
              onClick={() => schema && void copy(schemaSql(schema), 'sql-copied')}
            >
              Скопировать SQL
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              disabled={!exportable}
              onClick={() =>
                schema &&
                downloadBlob(
                  new Blob([schemaSql(schema)], { type: 'application/sql' }),
                  fileName(pageCount > 1 ? `${boardTitle} — ${pageName}` : boardTitle, 'sql'),
                )
              }
            >
              Скачать .sql
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              disabled={tables === 0}
              onClick={() => schema && void copy(schemaMermaid(schema), 'mermaid-copied')}
            >
              Скопировать Mermaid
            </Button>
            <Button type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setExporting(true)}>
              Архитектура как код…
            </Button>
            {message && (
              <p role={message === 'copy-failed' ? 'alert' : 'status'} className="px-2 text-xs text-muted-foreground">
                {MESSAGES[message]}
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
