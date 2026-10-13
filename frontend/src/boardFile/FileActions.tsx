import { FileDown, FileUp, Save } from 'lucide-react'
import { useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import type { Author } from '../diagram/attribution.ts'
import type { ImageHost } from '../diagram/images.ts'
import { downloadDrawio } from '../drawio/files.ts'
import { drawioMessages } from '../drawio/messages.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { embeddedImages } from '../image/inlineImages.ts'
import { BoardFileError } from './format.ts'
import { boardFileMessages as m } from './messages.ts'
import { applyOpenedFile, BOARD_FILE_TYPES, downloadBoardFile, readOpenedFile } from './openFile.ts'
import { boardFileBytes } from './write.ts'

interface FileActionsProps {
  document: Y.Doc | null
  title: string
  /** Receives the id of the first imported page. */
  onImported: (pageId: string) => void
  /** The participant may only view the board: saving and the export are offered, the import is not. */
  readOnly?: boolean
  /** The participant who imports, whom the imported elements keep as who changed them last. */
  author?: Author | null
  /** Where the pictures of an imported file are stored; without it they stay in `data:` addresses. */
  images?: ImageHost | null
}

/**
 * The files of a board: the import of a `.codraw` file or of a file of draw.io, the board saved as `.codraw` without
 * losses, and its export to `.drawio` for draw.io.
 */
export function FileActions({ document, title, onImported, readOnly = false, author = null, images = null }: FileActionsProps) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>, failed: string) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof BoardFileError ? cause.message : failed)
    } finally {
      setBusy(false)
    }
  }

  const importFile = (file: File) =>
    run(async () => {
      if (!document) return
      const [first] = await applyOpenedFile(document, await readOpenedFile(file, file.name), images, author)
      if (first) onImported(first)
    }, m.importFailed)

  // Both files carry the pictures of the board, so that they open without access to it.
  const saveFile = () =>
    run(async () => {
      if (document) downloadBoardFile(title, await boardFileBytes(document, title))
    }, m.saveFailed)

  const exportFile = () =>
    run(async () => {
      if (document) downloadDrawio(title, exportDrawio(document, await embeddedImages(document)))
    }, m.saveFailed)

  return (
    <div className="flex shrink-0 items-center gap-1">
      {!readOnly && (
        <>
          <input
            ref={input}
            type="file"
            accept={BOARD_FILE_TYPES}
            aria-label={m.fileInput}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void importFile(file)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.importLabel}
            title={m.importTitle}
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
        aria-label={m.saveLabel}
        title={m.saveTitle}
        disabled={!document || busy}
        onClick={() => void saveFile()}
      >
        <Save />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={drawioMessages.exportLabel}
        title={drawioMessages.exportTitle}
        disabled={!document || busy}
        onClick={() => void exportFile()}
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
