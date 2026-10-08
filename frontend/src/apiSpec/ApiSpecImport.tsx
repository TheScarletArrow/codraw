import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CellData } from '../diagram/model.ts'
import { reportError } from '../errors/reporting.ts'
import { apiGraph, apiGraphError, apiSpecCells, apiSummary } from './apiSpecCells.ts'
import { MAX_DOCUMENT_SIZE, type ApiSource } from './loadDocument.ts'
import { parseApiSpecs, type ApiSpec } from './parseApiSpec.ts'

/** How long the text rests before it is parsed: parsing a large document of YAML takes a while. */
const PARSE_DELAY = 200

/** What the window says before it has a document. */
const HINT = 'OpenAPI 3 или Swagger 2.0, AsyncAPI 2 или 3 — в YAML или JSON'

/** The text of the field among the documents, as errors name it. */
const TEXT_SOURCE = 'Текст'

interface ApiSpecImportProps {
  /** Adds the cells built for a top-left corner to the page. */
  onAdd: (cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  /** Opens a proposal whose draft gets the cells of this import as an update. */
  onUpdate?: (source: string, summary: string, cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  onBack: () => void
  busy: boolean
  /** Why the last addition failed. */
  error: string | null
}

/** The documents parsed for `sources`. */
interface Parsed {
  sources: ApiSource[]
  specs: ApiSpec[]
  errors: string[]
}

/**
 * The import of OpenAPI and AsyncAPI in the menu «SQL и Mermaid»: documents from the text and from files, parsed while
 * the participant types, a summary of what the page gets, the errors of the documents it does not get.
 */
export function ApiSpecImport({ onAdd, onUpdate, onBack, busy, error }: ApiSpecImportProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<ApiSource[]>([])
  const [models, setModels] = useState(true)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const sources = useMemo(() => (text.trim() === '' ? files : [...files, { name: TEXT_SOURCE, text }]), [files, text])

  useEffect(() => {
    if (sources.length === 0) return
    let current = true
    const timer = setTimeout(() => {
      parseApiSpecs(sources)
        .then((result) => current && setParsed({ sources, ...result }))
        .catch((failure: unknown) => {
          // A document that cannot be imported is an error of its own: this is a fault of CoDraw.
          reportError('error', failure)
          if (current) setParsed({ sources, specs: [], errors: ['Не удалось разобрать документы'] })
        })
    }, PARSE_DELAY)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [sources])

  // The last result stays on view while the next one is parsed, but cannot be added.
  const result = sources.length > 0 ? parsed : null
  const pending = sources.length > 0 && parsed?.sources !== sources
  const graph = useMemo(() => (result && result.specs.length > 0 ? apiGraph(result.specs, { models }) : null), [result, models])
  const tooLarge = graph ? apiGraphError(graph) : null
  const errors = [...(result?.errors ?? []), ...(tooLarge ? [tooLarge] : []), ...(error ? [error] : [])]
  const status = graph ? apiSummary(graph) : sources.length === 0 ? HINT : pending ? 'Разбор…' : null

  const openFiles = async (list: FileList | null) => {
    if (!list) return
    // A file larger than the limit is not read: its size alone refuses it.
    const read = async (file: File) => ({ name: file.name, size: file.size, text: file.size > MAX_DOCUMENT_SIZE ? '' : await file.text() })
    setFiles(await Promise.all(Array.from(list, read)))
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Назад" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="text-sm font-semibold">Импорт OpenAPI / AsyncAPI</h2>
      </div>
      <textarea
        aria-label="OpenAPI или AsyncAPI"
        placeholder={'openapi: 3.0.3\ninfo:\n  title: Petstore\npaths:\n  /pets:\n    get: …'}
        rows={8}
        spellCheck={false}
        className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          Открыть файлы
        </Button>
        <input
          ref={input}
          type="file"
          accept=".yaml,.yml,.json"
          multiple
          hidden
          aria-label="Файлы OpenAPI и AsyncAPI"
          onChange={(event) => void openFiles(event.target.files)}
        />
        {files.length > 0 && (
          <span className="truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(', ')}>
            Файлов: {files.length}
          </span>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm" title="Схемы данных — таблицами с полем на свойство и связями по $ref">
        <input type="checkbox" checked={models} onChange={(event) => setModels(event.target.checked)} />
        Модели таблицами
      </label>
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-xs text-destructive">
          {errors.map((message, index) => (
            <p key={index} className="break-words">
              {message}
            </p>
          ))}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        disabled={busy || pending || !graph || tooLarge !== null}
        onClick={() => graph && onAdd((origin) => apiSpecCells(graph, origin, undefined, 'api'))}
      >
        Добавить на страницу
      </Button>
      {onUpdate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || pending || !graph || tooLarge !== null}
          onClick={() => graph && onUpdate(sourceTitle(sources), apiSummary(graph), (origin) => apiSpecCells(graph, origin, undefined, 'api'))}
        >
          Обновить через предложение
        </Button>
      )}
    </>
  )
}

const sourceTitle = (sources: ApiSource[]) =>
  sources.length === 1 ? sources[0]!.name : sources.length > 1 ? `${sources.length} файлов OpenAPI / AsyncAPI` : 'OpenAPI / AsyncAPI'
