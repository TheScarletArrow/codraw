import { ImageDown } from 'lucide-react'
import { useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from '../diagram/editor.ts'
import { embedDiagram, type ExportedImage } from '../diagram/svgExport.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { exportDrawioPage } from '../drawio/serialize.ts'
import { downloadBlob } from '../lib/download.ts'
import { DEFAULT_PNG_SCALE, imageFileName, PNG_SCALES, type ImageFormat, type PngScale } from './files.ts'
import { canCopyImages, copyPng, svgToPng } from './png.ts'

interface ImageExportMenuProps {
  editor: DiagramEditor | null
  /** The board document: the SVG image carries the diagram of the page from it. */
  document: Y.Doc | null
  boardTitle: string
  pageName: string
  pageCount: number
}

type Message = 'copied' | 'save-failed' | 'copy-failed'

const MESSAGES: Record<Message, string> = {
  copied: 'Изображение скопировано',
  'save-failed': 'Не удалось сохранить изображение',
  'copy-failed': 'Не удалось скопировать изображение',
}

/** Saves the current page, or what is selected on it, as a PNG or SVG image, or copies the PNG to the clipboard. */
export function ImageExportMenu({ editor, document: doc, boardTitle, pageName, pageCount }: ImageExportMenuProps) {
  const { hasCells, canCopy } = useEditorState(editor)
  const [selectionOnly, setSelectionOnly] = useState(false)
  const [transparent, setTransparent] = useState(false)
  const [scale, setScale] = useState<PngScale>(DEFAULT_PNG_SCALE)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  // Without selected shapes the whole page is saved, whatever the box says.
  const onlySelected = selectionOnly && canCopy
  const clipboardSupported = canCopyImages()

  const exportImage = () => editor?.exportSvg({ selectionOnly: onlySelected, transparent }) ?? null
  /** The SVG with the diagram of what it shows, so that CoDraw and draw.io open it for editing. */
  const editableSvg = (image: ExportedImage) => {
    const diagram = doc && editor && exportDrawioPage(doc, editor.pageId, image.cellIds ?? undefined)
    return diagram ? embedDiagram(image.svg, diagram) : image.svg
  }

  const save = async (format: ImageFormat) => {
    const image = exportImage()
    if (!image) return
    setBusy(true)
    setMessage(null)
    try {
      const blob =
        format === 'png' ? await svgToPng(image, scale) : new Blob([editableSvg(image)], { type: 'image/svg+xml' })
      downloadBlob(blob, imageFileName(boardTitle, pageName, pageCount, format))
    } catch {
      setMessage('save-failed')
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
    copyPng(svgToPng(image, scale))
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
          title="Экспорт в изображение: страница в PNG или SVG"
          disabled={!editor}
        >
          <ImageDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-3" aria-label="Экспорт в изображение">
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
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" disabled={!hasCells || busy} onClick={() => void save('png')}>
            Сохранить PNG
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasCells || busy} onClick={() => void save('svg')}>
            Сохранить SVG
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
            role={message === 'copied' ? undefined : 'alert'}
            aria-live="polite"
            className={message === 'copied' ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {MESSAGES[message]}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
