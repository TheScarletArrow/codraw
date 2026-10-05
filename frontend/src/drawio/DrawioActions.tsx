import { FileDown, FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { DRAWIO_FILE_TYPES, downloadDrawio } from './files.ts'
import { importPages } from './importPages.ts'
import { DrawioFormatError, parseDrawio } from './parse.ts'
import { exportDrawio } from './serialize.ts'

interface DrawioActionsProps {
  document: Y.Doc | null
  title: string
  /** Receives the id of the first imported page. */
  onImported: (pageId: string) => void
  /** The participant may only view the board: only the export is offered. */
  readOnly?: boolean
}

/** Import of `.drawio` files into the board and export of the board to `.drawio`. */
export function DrawioActions({ document, title, onImported, readOnly = false }: DrawioActionsProps) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File) => {
    if (!document) return
    setError(null)
    setBusy(true)
    try {
      const [first] = importPages(document, await parseDrawio(await file.text()))
      if (first) onImported(first)
    } catch (cause) {
      setError(cause instanceof DrawioFormatError ? cause.message : 'Не удалось импортировать файл')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {!readOnly && (
        <>
          <input
            ref={input}
            type="file"
            accept={DRAWIO_FILE_TYPES}
            aria-label="Файл draw.io"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void handleFile(file)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Импорт из .drawio"
            title="Импорт из .drawio: страницы файла добавятся к доске"
            disabled={!document || busy}
            onClick={() => input.current?.click()}
          >
            <FileUp />
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Экспорт в .drawio"
        title="Экспорт в .drawio: все страницы доски"
        disabled={!document}
        onClick={() => document && downloadDrawio(title, exportDrawio(document))}
      >
        <FileDown />
      </Button>
      {error && (
        <span role="alert" className="text-sm whitespace-nowrap text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
