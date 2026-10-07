import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_DOCUMENT_SIZE, type ApiSource } from '../apiSpec/loadDocument.ts'
import type { CellData } from '../diagram/model.ts'
import { reportError } from '../errors/reporting.ts'
import { composeGraph, composeGraphError, composeSummary } from './composeGraph.ts'
import { infraCells } from './infraCells.ts'
import { parseComposeFiles, type ComposeService } from './parseCompose.ts'

/** How long the text rests before it is parsed: parsing a large document of YAML takes a while. */
const PARSE_DELAY = 200

/** What the window says before it has a file. */
const HINT = 'docker-compose.yml или compose.yaml; несколько файлов сливаются, как docker compose -f a.yml -f b.yml'

/** The text of the field among the files, as errors name it. */
const TEXT_SOURCE = 'Текст'

interface InfraImportProps {
  /** Adds the cells built for a top-left corner to the page. */
  onAdd: (cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  onBack: () => void
  busy: boolean
  /** Why the last addition failed. */
  error: string | null
}

/** The services parsed for `sources`. */
interface Parsed {
  sources: ApiSource[]
  services: ComposeService[]
  errors: string[]
}

/**
 * The import of docker-compose in the menu «SQL и Mermaid»: files and the text merged into one project, parsed while the
 * participant types, a summary of what the page gets, the errors of the files it does not get.
 */
export function InfraImport({ onAdd, onBack, busy, error }: InfraImportProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<ApiSource[]>([])
  const [environment, setEnvironment] = useState(true)
  const [c4, setC4] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const sources = useMemo(() => (text.trim() === '' ? files : [...files, { name: TEXT_SOURCE, text }]), [files, text])

  useEffect(() => {
    if (sources.length === 0) return
    let current = true
    const timer = setTimeout(() => {
      parseComposeFiles(sources)
        .then((result) => current && setParsed({ sources, ...result }))
        .catch((failure: unknown) => {
          // A file that cannot be imported is an error of its own: this is a fault of CoDraw.
          reportError('error', failure)
          if (current) setParsed({ sources, services: [], errors: ['Не удалось разобрать файлы'] })
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
  const graph = useMemo(
    () => (result && result.services.length > 0 ? composeGraph(result.services, { environment, c4 }) : null),
    [result, environment, c4],
  )
  const tooLarge = graph ? composeGraphError(graph) : null
  const errors = [...(result?.errors ?? []), ...(tooLarge ? [tooLarge] : []), ...(error ? [error] : [])]
  const status = graph ? composeSummary(graph) : sources.length === 0 ? HINT : pending ? 'Разбор…' : null

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
        <h2 className="text-sm font-semibold">Импорт docker-compose</h2>
      </div>
      <textarea
        aria-label="docker-compose"
        placeholder={'services:\n  backend:\n    build: ./backend\n    depends_on: [postgres]\n  postgres:\n    image: postgres:18'}
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
          accept=".yaml,.yml"
          multiple
          hidden
          aria-label="Файлы docker-compose"
          onChange={(event) => void openFiles(event.target.files)}
        />
        {files.length > 0 && (
          <span className="truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(', ')}>
            Файлов: {files.length}
          </span>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm" title="Адреса других сервисов в переменных окружения — связями с протоколом">
        <input type="checkbox" checked={environment} onChange={(event) => setEnvironment(event.target.checked)} />
        Связи по переменным окружения
      </label>
      <label className="flex items-center gap-2 text-sm" title="Сервисы — фигурами Container и Database нотации C4">
        <input type="checkbox" checked={c4} onChange={(event) => setC4(event.target.checked)} />
        Фигуры C4
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
        onClick={() => graph && onAdd((origin) => infraCells(graph, origin))}
      >
        Добавить на страницу
      </Button>
    </>
  )
}
