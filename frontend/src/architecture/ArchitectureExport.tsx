import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CellData } from '../diagram/model.ts'
import { documentMessages } from '../apiSpec/messages.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
import { mermaidC4 } from './mermaid.ts'
import { architectureModel, architectureSummary, modelElements, type ArchModel } from './model.ts'
import { plantUml } from './plantuml.ts'
import { structurizrDsl } from './structurizr.ts'
import { architectureMessages as m } from './messages.ts'

interface Format {
  label: string
  extension: string
  type: string
  write: (model: ArchModel) => string
}

/** The formats of the export, in the order the window offers them. */
const FORMATS: Format[] = [
  { label: 'Structurizr DSL', extension: 'dsl', type: 'text/plain', write: structurizrDsl },
  { label: 'C4-PlantUML', extension: 'puml', type: 'text/plain', write: plantUml },
  { label: 'Mermaid C4', extension: 'mmd', type: 'text/plain', write: mermaidC4 },
]

type Message = 'copied' | 'copy-failed'

interface ArchitectureExportProps {
  /** The cells of the current page. */
  cells: CellData[]
  /** The name of the board, and of the page when the board has several: the title of the code and the name of the file. */
  title: string
  onBack: () => void
}

/**
 * «Архитектура как код» in the menu «SQL и Mermaid»: the architecture of the page in Structurizr DSL, C4-PlantUML or
 * Mermaid C4, to copy or to save into the repository next to the code.
 */
export function ArchitectureExport({ cells, title, onBack }: ArchitectureExportProps) {
  const [format, setFormat] = useState(FORMATS[0]!)
  const [message, setMessage] = useState<Message | null>(null)
  const model = useMemo(() => architectureModel(cells, title), [cells, title])
  const text = useMemo(() => format.write(model), [format, model])
  const empty = modelElements(model).length === 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('copied')
    } catch {
      setMessage('copy-failed')
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={documentMessages.back} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="text-sm font-semibold">{m.exportTitle}</h2>
      </div>
      <div role="group" aria-label={m.format} className="flex gap-1">
        {FORMATS.map((item) => (
          <Button
            key={item.extension}
            type="button"
            size="sm"
            variant={item === format ? 'secondary' : 'ghost'}
            aria-pressed={item === format}
            onClick={() => {
              setFormat(item)
              setMessage(null)
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <pre aria-label={m.exportText} tabIndex={0} className="max-h-72 overflow-auto rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs">
        {text}
      </pre>
      <p role="status" className="text-xs text-muted-foreground">
        {architectureSummary(model)}
      </p>
      {empty && (
        <p className="text-xs text-muted-foreground">
          {m.exportHint}
        </p>
      )}
      {message && (
        <p role={message === 'copy-failed' ? 'alert' : undefined} className="text-xs text-muted-foreground">
          {message === 'copied' ? m.copied : m.copyFailed}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={empty} onClick={() => void copy()}>
          {m.copy}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={empty}
          onClick={() => downloadBlob(new Blob([text], { type: format.type }), fileName(title, format.extension))}
        >
          {m.download(format.extension)}
        </Button>
      </div>
    </>
  )
}
