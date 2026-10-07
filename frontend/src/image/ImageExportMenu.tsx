import { ImageDown } from 'lucide-react'
import { useCallback, useState, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from '../diagram/editor.ts'
import { embedDiagram, type ExportedImage } from '../diagram/svgExport.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { exportDrawioPage } from '../drawio/serialize.ts'
import { downloadBlob } from '../lib/download.ts'
import {
  DEFAULT_PNG_SCALE,
  imageFileName,
  pdfFileName,
  PNG_SCALES,
  type ImageFormat,
  type PdfPages,
  type PngScale,
} from './files.ts'
import { boardImages, imagesToPdf, pdfPages } from './pdf.ts'
import { embeddedImages, PDF_IMAGE_TYPES, withInlinedImages } from './inlineImages.ts'
import { canCopyImages, copyPng, svgToPng } from './png.ts'

interface ImageExportMenuProps {
  editor: DiagramEditor | null
  /** The board document: the SVG image carries the diagram of the page from it. */
  document: Y.Doc | null
  boardTitle: string
  pageName: string
  pageCount: number
}

type Message = 'copied' | 'save-failed' | 'copy-failed' | 'pdf-busy' | 'pdf-failed'

const MESSAGES: Record<Message, string> = {
  copied: 'Изображение скопировано',
  'save-failed': 'Не удалось сохранить изображение',
  'copy-failed': 'Не удалось скопировать изображение',
  'pdf-busy': 'PDF готовится…',
  'pdf-failed': 'Не удалось сохранить PDF',
}

/** Messages that tell how things go rather than what went wrong. */
const NEWS: ReadonlySet<Message> = new Set(['copied', 'pdf-busy'])

/** Whether a PDF of all pages of the board would have pages; follows the changes of everyone while there is `doc`. */
function useBoardHasCells(doc: Y.Doc | null): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      doc?.on('update', changed)
      return () => doc?.off('update', changed)
    },
    [doc],
  )
  return useSyncExternalStore(subscribe, () => doc !== null && pdfPages(doc).length > 0)
}

/**
 * Saves the current page, or what is selected on it, as a PNG or SVG image or a PDF, or copies the PNG to the
 * clipboard; the PDF can also have all pages of the board.
 */
export function ImageExportMenu({ editor, document: doc, boardTitle, pageName, pageCount }: ImageExportMenuProps) {
  const { hasCells, canCopy } = useEditorState(editor)
  const [selectionOnly, setSelectionOnly] = useState(false)
  const [transparent, setTransparent] = useState(false)
  const [scale, setScale] = useState<PngScale>(DEFAULT_PNG_SCALE)
  const [pages, setPages] = useState<PdfPages>('current')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  // Without selected shapes the whole page is saved, whatever the box says.
  const onlySelected = selectionOnly && canCopy
  // The selection is on the current page; a board of one page has nothing else.
  const allPages = pages === 'all' && pageCount > 1 && !onlySelected
  const boardHasCells = useBoardHasCells(allPages ? doc : null)
  const canSavePdf = allPages ? boardHasCells : hasCells
  const clipboardSupported = canCopyImages()

  const exportImage = () => editor?.exportSvg({ selectionOnly: onlySelected, transparent }) ?? null
  /**
   * The SVG with the diagram of what it shows, so that CoDraw and draw.io open it for editing; the pictures of the board
   * are in the diagram too.
   */
  const editableSvg = async (image: ExportedImage) => {
    const pictures = doc && editor ? await embeddedImages(doc, editor.pageId) : undefined
    const diagram = doc && editor && exportDrawioPage(doc, editor.pageId, image.cellIds ?? undefined, pictures)
    return diagram ? embedDiagram(image.svg, diagram) : image.svg
  }

  const save = async (format: ImageFormat) => {
    const exported = exportImage()
    if (!exported) return
    setBusy(true)
    setMessage(null)
    try {
      // The pictures of image shapes go into the file: it shows them without access to the board.
      const image = await withInlinedImages(exported)
      const blob =
        format === 'png' ? await svgToPng(image, scale) : new Blob([await editableSvg(image)], { type: 'image/svg+xml' })
      downloadBlob(blob, imageFileName(boardTitle, pageName, pageCount, format))
    } catch {
      setMessage('save-failed')
    } finally {
      setBusy(false)
    }
  }

  /** The images of the pages of the PDF: of the pages of the board with objects, or of the current page. */
  const pdfImages = async (): Promise<ExportedImage[]> => {
    const exported = allPages && doc && editor ? await boardImages(doc, editor, { transparent }) : [exportImage()]
    const images = exported.filter((image) => image !== null)
    return Promise.all(images.map((image) => withInlinedImages(image, { types: PDF_IMAGE_TYPES })))
  }

  const savePdf = async () => {
    setBusy(true)
    setMessage('pdf-busy')
    try {
      const images = await pdfImages()
      if (images.length > 0) {
        const pdf = await imagesToPdf(images)
        downloadBlob(pdf, pdfFileName(boardTitle, pageName, pageCount, allPages ? 'all' : 'current'))
      }
      setMessage(null)
    } catch {
      setMessage('pdf-failed')
    } finally {
      setBusy(false)
    }
  }

  const copy = () => {
    const image = exportImage()
    if (!image) return
    setBusy(true)
    setMessage(null)
    // Called right in the click handler: the browser lets only it write to the clipboard.
    copyPng(withInlinedImages(image).then((inlined) => svgToPng(inlined, scale)))
      .then(
        () => setMessage('copied'),
        () => setMessage('copy-failed'),
      )
      .finally(() => setBusy(false))
  }

  return (
    <Popover onOpenChange={() => setMessage(null)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Экспорт в изображение"
          title="Экспорт в изображение: страница в PNG, SVG или PDF"
          disabled={!editor}
        >
          <ImageDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3" aria-label="Экспорт в изображение">
        {!hasCells && <p className="text-sm text-muted-foreground">На странице нет объектов</p>}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm has-disabled:text-muted-foreground">
            <input
              type="checkbox"
              checked={onlySelected}
              disabled={!canCopy}
              onChange={(event) => setSelectionOnly(event.target.checked)}
            />
            Только выделенное
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
            Прозрачный фон
          </label>
          <label className="flex items-center gap-2 text-sm">
            Масштаб PNG
            <select
              aria-label="Масштаб PNG"
              className="h-8 rounded-md border bg-background px-2 text-foreground"
              value={scale}
              onChange={(event) => setScale(Number(event.target.value) as PngScale)}
            >
              {PNG_SCALES.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm has-disabled:text-muted-foreground">
            Страницы PDF
            <select
              aria-label="Страницы PDF"
              className="h-8 rounded-md border bg-background px-2 text-foreground disabled:text-muted-foreground"
              value={allPages ? 'all' : 'current'}
              disabled={pageCount <= 1 || onlySelected}
              onChange={(event) => setPages(event.target.value as PdfPages)}
            >
              <option value="current">Текущая страница</option>
              <option value="all">Все страницы</option>
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" disabled={!hasCells || busy} onClick={() => void save('png')}>
            Сохранить PNG
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasCells || busy} onClick={() => void save('svg')}>
            Сохранить SVG
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!canSavePdf || busy} onClick={() => void savePdf()}>
            Сохранить PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title={clipboardSupported ? undefined : 'Браузер не умеет копировать изображения'}
            disabled={!hasCells || busy || !clipboardSupported}
            onClick={copy}
          >
            Копировать PNG
          </Button>
        </div>
        {message && (
          // Not a `status` role: the board page has one for its connection.
          <p
            role={NEWS.has(message) ? undefined : 'alert'}
            aria-live="polite"
            className={NEWS.has(message) ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {MESSAGES[message]}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
