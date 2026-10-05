import { ArrowLeft, Database } from 'lucide-react'
import { useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from '../diagram/editor.ts'
import { getCells, readCell, type CellData } from '../diagram/model.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
import { mermaidCells, mermaidSummary } from '../mermaid/mermaidCells.ts'
import { MermaidError, parseMermaid, type MermaidDiagram } from '../mermaid/parseMermaid.ts'
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
}

type Message = 'sql-copied' | 'mermaid-copied' | 'copy-failed' | 'import-failed'

const MESSAGES: Record<Message, string> = {
  'sql-copied': 'SQL скопирован',
  'mermaid-copied': 'Mermaid скопирован',
  'copy-failed': 'Не удалось скопировать',
  'import-failed': 'Не удалось добавить схему',
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
    const empty = diagram.kind === 'flowchart' ? diagram.nodes.length === 0 : diagram.tables.length === 0
    return { diagram: empty ? null : diagram, error: empty ? 'В тексте нет ни одного узла или таблицы' : null }
  } catch (error) {
    if (error instanceof MermaidError) return { diagram: null, error: error.message }
    throw error
  }
}

const countReferences = (schema: SqlSchema) =>
  schema.tables.reduce((sum, table) => sum + table.foreignKeys.reduce((keys, key) => keys + key.columns.length, 0), 0)

/**
 * Tables of a database in and out of the current page: DDL becomes an ER diagram, the diagram becomes DDL or Mermaid;
 * a flowchart or an ER diagram of Mermaid becomes a diagram of the page.
 */
export function SqlMenu({ editor, document: doc, pageId, boardTitle, pageName, pageCount, readOnly }: SqlMenuProps) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState<'sql' | 'mermaid' | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<SqlFile[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const schema = open && doc && pageId ? diagramSchema(pageCells(doc, pageId)) : null
  const tables = schema?.tables.length ?? 0
  const imported = importing === 'sql' ? importedSchema(files, text) : null
  const mermaid = importing === 'mermaid' ? importedDiagram(text) : null

  const reset = () => {
    setImporting(null)
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

  const addTables = async () => {
    if (!editor || !doc || !pageId) return
    const origin = () => placeBeside(pageCells(doc, pageId))
    const cells =
      imported && imported.tables.length > 0
        ? () => schemaCells(imported, origin())
        : mermaid?.diagram
          ? () => mermaidCells(mermaid.diagram!, origin())
          : null
    if (!cells) return
    setBusy(true)
    try {
      editor.insertCells(await cells())
      setOpen(false)
      reset()
    } catch {
      setMessage('import-failed')
    } finally {
      setBusy(false)
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
          title="SQL и Mermaid: импорт и выгрузка схем"
          disabled={!doc || !pageId}
        >
          <Database />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="SQL и Mermaid" className={importing ? 'flex w-[28rem] flex-col gap-2' : 'flex w-64 flex-col gap-1 p-2'}>
        {importing === 'mermaid' && mermaid ? (
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
                {mermaid.diagram ? mermaidSummary(mermaid.diagram) : 'Блок-схема (flowchart, graph) или ER-диаграмма (erDiagram)'}
              </p>
            )}
            {message && (
              <p role="alert" className="text-xs text-destructive">
                {MESSAGES[message]}
              </p>
            )}
            <Button type="button" size="sm" disabled={busy || !mermaid.diagram} onClick={() => void addTables()}>
              Добавить на страницу
            </Button>
          </>
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
            </div>
            <p role="status" className="text-xs text-muted-foreground">
              Таблиц: {imported.tables.length}, связей: {countReferences(imported)}, пропущено операторов: {imported.skipped}
            </p>
            {message && (
              <p role="alert" className="text-xs text-destructive">
                {MESSAGES[message]}
              </p>
            )}
            <Button type="button" size="sm" disabled={busy || imported.tables.length === 0} onClick={() => void addTables()}>
              Добавить на страницу
            </Button>
          </>
        ) : (
          <>
            <p className="px-2 pb-1 text-xs text-muted-foreground">Таблиц на странице: {tables}</p>
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
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              disabled={tables === 0}
              onClick={() => schema && void copy(schemaSql(schema), 'sql-copied')}
            >
              Скопировать SQL
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              disabled={tables === 0}
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
