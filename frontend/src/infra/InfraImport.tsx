import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_DOCUMENT_SIZE, type ApiSource } from '../apiSpec/loadDocument.ts'
import { documentMessages as d } from '../apiSpec/messages.ts'
import type { CellData } from '../diagram/model.ts'
import { reportError } from '../errors/reporting.ts'
import type { InfraFormat } from './formats.ts'
import { infraCells } from './infraCells.ts'
import { infraMessages as m } from './messages.tsx'

/** How long the text rests before it is parsed: parsing a large document of YAML takes a while. */
const PARSE_DELAY = 200

interface InfraImportProps<Parsed> {
  format: InfraFormat<Parsed>
  /** Adds the cells built for a top-left corner to the page. */
  onAdd: (cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  /** Opens a proposal whose draft gets the cells of this import as an update. */
  onUpdate?: (source: string, summary: string, cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  /** Prefix of `codrawSource` markers for cells of this import. */
  sourcePrefix?: string
  onBack: () => void
  busy: boolean
  /** Why the last addition failed. */
  error: string | null
}

/** What the files of `sources` hold. */
interface Result<Parsed> {
  sources: ApiSource[]
  parsed: Parsed | null
  errors: string[]
}

/**
 * The import of files of infrastructure — docker-compose, Kubernetes or Terraform — in the menu «SQL и Mermaid»: files
 * and the text read together, parsed while the participant types, a summary of what the page gets, warnings about it, the
 * errors of the files it does not get.
 */
export function InfraImport<Parsed>({ format, onAdd, onUpdate, sourcePrefix = 'infra', onBack, busy, error }: InfraImportProps<Parsed>) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<ApiSource[]>([])
  const [environment, setEnvironment] = useState(true)
  const [c4, setC4] = useState(false)
  const [parsed, setParsed] = useState<Result<Parsed> | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const sources = useMemo(() => (text.trim() === '' ? files : [...files, { name: d.text, text }]), [files, text])

  useEffect(() => {
    if (sources.length === 0) return
    let current = true
    const timer = setTimeout(() => {
      format
        .parse(sources)
        .then((result) => current && setParsed({ sources, ...result }))
        .catch((failure: unknown) => {
          // A file that cannot be imported is an error of its own: this is a fault of CoDraw.
          reportError('error', failure)
          if (current) setParsed({ sources, parsed: null, errors: [m.parseFailed] })
        })
    }, PARSE_DELAY)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [sources, format])

  // The last result stays on view while the next one is parsed, but cannot be added.
  const result = sources.length > 0 ? parsed : null
  const pending = sources.length > 0 && parsed?.sources !== sources
  const graph = useMemo(
    () => (result?.parsed && !format.isEmpty(result.parsed) ? format.graph(result.parsed, { environment, c4 }) : null),
    [result, format, environment, c4],
  )
  const tooLarge = graph ? format.error(graph) : null
  const errors = [...(result?.errors ?? []), ...(tooLarge ? [tooLarge] : []), ...(error ? [error] : [])]
  const status = graph && result?.parsed ? format.summary(result.parsed, graph) : sources.length === 0 ? format.hint : pending ? d.parsing : null
  const warnings = graph && result?.parsed && format.warnings ? format.warnings(result.parsed, graph) : []
  const limit = format.maxSize ?? MAX_DOCUMENT_SIZE

  const openFiles = async (list: FileList | null) => {
    if (!list) return
    // A file larger than the limit is not read: its size alone refuses it.
    const read = async (file: File) => ({ name: file.name, size: file.size, text: file.size > limit ? '' : await file.text() })
    setFiles(await Promise.all(Array.from(list, read)))
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={d.back} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="text-sm font-semibold">{format.title}</h2>
      </div>
      <textarea
        aria-label={format.textLabel}
        placeholder={format.placeholder}
        rows={8}
        spellCheck={false}
        className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          {d.openFiles}
        </Button>
        <input
          ref={input}
          type="file"
          accept={format.accept}
          multiple
          hidden
          aria-label={format.filesLabel}
          onChange={(event) => void openFiles(event.target.files)}
        />
        {files.length > 0 && (
          <span className="truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(', ')}>
            {d.fileCount} {files.length}
          </span>
        )}
      </div>
      {format.options.includes('environment') && (
        <label className="flex items-center gap-2 text-sm" title={m.environmentTitle}>
          <input type="checkbox" checked={environment} onChange={(event) => setEnvironment(event.target.checked)} />
          {m.environment}
        </label>
      )}
      {format.options.includes('c4') && (
        <label className="flex items-center gap-2 text-sm" title={m.c4Title}>
          <input type="checkbox" checked={c4} onChange={(event) => setC4(event.target.checked)} />
          {m.c4}
        </label>
      )}
      {format.limits && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">{m.limits}</summary>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            {format.limits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
      {warnings.length > 0 && (
        <ul aria-label={m.warnings} className="flex flex-col gap-1 text-xs text-amber-700 dark:text-amber-400">
          {warnings.map((warning, index) => (
            <li key={index} className="break-words">
              {warning}
            </li>
          ))}
        </ul>
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
        onClick={() => graph && onAdd((origin) => infraCells(graph, origin, undefined, sourcePrefix))}
      >
        {d.addToPage}
      </Button>
      {onUpdate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || pending || !graph || tooLarge !== null}
          onClick={() => graph && onUpdate(sourceTitle(sources, format.source), format.summary(result!.parsed!, graph), (origin) => infraCells(graph, origin, undefined, sourcePrefix))}
        >
          {d.updateViaProposal}
        </Button>
      )}
    </>
  )
}

const sourceTitle = (sources: ApiSource[], fallback: string) =>
  sources.length === 1 ? sources[0]!.name : sources.length > 1 ? m.sourceFiles(sources.length) : fallback
