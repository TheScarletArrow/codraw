import { ArrowLeft, Database } from 'lucide-react'
import { useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from '../diagram/editor.ts'
import { getCells, readCell, type CellData } from '../diagram/model.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
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
  'import-failed': 'Не удалось добавить таблицы',
}

/** The cells of a page, as its document has them. */
function pageCells(document: Y.Doc, pageId: string): CellData[] {
  return Array.from(getCells(document, pageId).entries(), ([id, cell]) => readCell(id, cell))
}

/** The schema of DDL from the opened files, in the order of migrations, then from the text. */
function importedSchema(files: SqlFile[], text: string): SqlSchema {
  return parseSql(text, parseSqlFiles(files))
}

const countReferences = (schema: SqlSchema) =>
  schema.tables.reduce((sum, table) => sum + table.foreignKeys.reduce((keys, key) => keys + key.columns.length, 0), 0)

/** Tables of a database in and out of the current page: DDL becomes an ER diagram, the diagram becomes DDL or Mermaid. */
export function SqlMenu({ editor, document: doc, pageId, boardTitle, pageName, pageCount, readOnly }: SqlMenuProps) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<SqlFile[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const schema = open && doc && pageId ? diagramSchema(pageCells(doc, pageId)) : null
  const tables = schema?.tables.length ?? 0
  const imported = importing ? importedSchema(files, text) : null

  const reset = () => {
    setImporting(false)
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
    if (!editor || !doc || !pageId || !imported || imported.tables.length === 0) return
    setBusy(true)
    try {
      editor.insertCells(await schemaCells(imported, placeBeside(pageCells(doc, pageId))))
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
        <Button type="button" variant="ghost" size="icon-sm" aria-label="SQL" title="SQL: импорт и выгрузка таблиц" disabled={!doc || !pageId}>
          <Database />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="SQL" className={importing ? 'flex w-[28rem] flex-col gap-2' : 'flex w-64 flex-col gap-1 p-2'}>
        {importing && imported ? (
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
              <Button type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setImporting(true)}>
                Импорт SQL…
              </Button>
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
