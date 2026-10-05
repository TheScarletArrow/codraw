import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Maximize,
  Redo2,
  TextWrap,
  Underline,
  Undo2,
  UnfoldHorizontal,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrangePicker } from './ArrangePicker.tsx'
import { AutoLayoutPicker } from './AutoLayoutPicker.tsx'
import { ColorPicker } from './ColorPicker.tsx'
import type { DiagramEditor, EdgeEnd, FontStyleFlag, SelectionText, TextAlign } from './editor.ts'
import { EDGE_MARKERS } from './extensions.ts'
import { FONT_FAMILIES } from './fonts.ts'
import { GeometryPicker } from './GeometryPicker.tsx'
import { LineStylePicker } from './LineStylePicker.tsx'
import { NumberField } from './NumberField.tsx'
import { TableTools } from './TableTools.tsx'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from './textSize.ts'
import { useEditorState } from './useEditorState.ts'

interface EditorToolbarProps {
  editor: DiagramEditor | null
  /** The participant may only view the board: only the scale is shown. */
  readOnly?: boolean
}

export function EditorToolbar({ editor, readOnly = false }: EditorToolbarProps) {
  const { canUndo, canRedo, scale } = useEditorState(editor)

  return (
    <div role="toolbar" aria-label="Инструменты" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {!readOnly && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Отменить"
            title="Отменить (Ctrl+Z)"
            disabled={!editor || !canUndo}
            onClick={() => editor?.undo()}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Повторить"
            title="Повторить (Ctrl+Shift+Z)"
            disabled={!editor || !canRedo}
            onClick={() => editor?.redo()}
          >
            <Redo2 />
          </Button>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Уменьшить"
        title="Уменьшить (Ctrl+колесо)"
        disabled={!editor}
        onClick={() => editor?.zoomOut()}
      >
        <ZoomOut />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-16 tabular-nums"
        aria-label="Масштаб"
        title="Сбросить масштаб до 100%"
        disabled={!editor}
        onClick={() => editor?.zoomActual()}
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Увеличить"
        title="Увеличить (Ctrl+колесо)"
        disabled={!editor}
        onClick={() => editor?.zoomIn()}
      >
        <ZoomIn />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Показать всё"
        title="Показать всё (Ctrl+Shift+H)"
        disabled={!editor}
        onClick={() => editor?.zoomToFit()}
      >
        <Maximize />
      </Button>
      {!readOnly && <AutoLayoutPicker editor={editor} />}
      {!readOnly && <EditingTools editor={editor} />}
    </div>
  )
}

/** Tools that change the selected objects. */
function EditingTools({ editor }: { editor: DiagramEditor | null }) {
  const { tableSelected, tableVendor, field, edgeMarkers, colors, line, text, geometry, arrange } = useEditorState(editor)

  return (
    <>
      {tableSelected && <TableTools editor={editor} vendor={tableVendor} field={field} />}
      {colors && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          {colors.hasShapes && (
            <ColorPicker
              label="Заливка"
              name="Цвет заливки"
              noneLabel="Без заливки"
              value={colors.fill}
              onChange={(color) => editor?.setColor('fill', color)}
            />
          )}
          <ColorPicker
            label="Линия"
            name="Цвет линии"
            noneLabel="Без линии"
            value={colors.stroke}
            onChange={(color) => editor?.setColor('stroke', color)}
          />
          <ColorPicker
            label="Текст"
            name="Цвет текста"
            value={colors.font}
            onChange={(color) => editor?.setColor('font', color)}
          />
        </>
      )}
      {line && <LineStylePicker line={line} onChange={(changes) => editor?.setLineStyle(changes)} />}
      {text && <TextTools text={text} editor={editor} />}
      {geometry && <GeometryPicker geometry={geometry} onChange={(changes) => editor?.setGeometry(changes)} />}
      {arrange >= 2 && (
        <ArrangePicker
          count={arrange}
          onAlign={(align) => editor?.alignShapes(align)}
          onDistribute={(direction) => editor?.distributeShapes(direction)}
        />
      )}
      {edgeMarkers && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <MarkerSelect label="Начало" end="start" value={edgeMarkers.start} editor={editor} />
          <MarkerSelect label="Конец" end="end" value={edgeMarkers.end} editor={editor} />
        </>
      )}
    </>
  )
}

const FONT_STYLES: { flag: FontStyleFlag; label: string; shortcut: string; icon: LucideIcon }[] = [
  { flag: 'bold', label: 'Жирный', shortcut: 'Ctrl+B', icon: Bold },
  { flag: 'italic', label: 'Курсив', shortcut: 'Ctrl+I', icon: Italic },
  { flag: 'underline', label: 'Подчёркнутый', shortcut: 'Ctrl+U', icon: Underline },
]

const TEXT_ALIGNS: { align: TextAlign; label: string; icon: LucideIcon }[] = [
  { align: 'left', label: 'Текст по левому краю', icon: AlignLeft },
  { align: 'center', label: 'Текст по центру', icon: AlignCenter },
  { align: 'right', label: 'Текст по правому краю', icon: AlignRight },
]

/**
 * Size, font styles and alignment of the text of the selected objects, and the width of the selected shapes that
 * follows their labels.
 */
function TextTools({ text, editor }: { text: SelectionText; editor: DiagramEditor | null }) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <FontSelect value={text.fontFamily} editor={editor} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Уменьшить текст"
        title="Уменьшить текст"
        onClick={() => editor?.stepFontSize(-1)}
      >
        <AArrowDown />
      </Button>
      <NumberField
        label="Размер текста"
        value={text.fontSize}
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        className="w-12 shrink-0 text-center"
        onCommit={(size) => editor?.setFontSize(size)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Увеличить текст"
        title="Увеличить текст"
        onClick={() => editor?.stepFontSize(1)}
      >
        <AArrowUp />
      </Button>
      {FONT_STYLES.map(({ flag, label, shortcut, icon: Icon }) => (
        <Button
          key={flag}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={text[flag]}
          title={`${label} (${shortcut})`}
          className={cn(text[flag] && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.toggleFontStyle(flag)}
        >
          <Icon />
        </Button>
      ))}
      {TEXT_ALIGNS.map(({ align, label, icon: Icon }) => (
        <Button
          key={align}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={text.align === align}
          title={label}
          className={cn(text.align === align && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setTextAlign(align)}
        >
          <Icon />
        </Button>
      ))}
      {text.autoWidth !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={text.autoWidth}
          title="Автоширина: ширина фигуры следует за её подписью"
          className={cn(text.autoWidth && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setAutoWidth(!text.autoWidth)}
        >
          <UnfoldHorizontal />
          Автоширина
        </Button>
      )}
      {text.textWrap !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={text.textWrap}
          title="Перенос: слова подписи переносятся по ширине фигуры"
          className={cn(text.textWrap && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setTextWrap(!text.textWrap)}
        >
          <TextWrap />
          Перенос
        </Button>
      )}
    </>
  )
}

/**
 * The font of the selected text, each font shown in itself; empty when the objects have different fonts. A font of
 * a draw.io file that the list does not have is shown as well.
 */
function FontSelect({ value, editor }: { value: string | null; editor: DiagramEditor | null }) {
  return (
    <select
      aria-label="Шрифт"
      title="Шрифт"
      className="h-8 w-36 shrink-0 rounded-md border bg-background px-2 text-sm text-foreground"
      style={{ fontFamily: value ?? undefined }}
      value={value ?? ''}
      onChange={(event) => editor?.setFontFamily(event.target.value)}
    >
      {value === null && <option value="">—</option>}
      {value !== null && !FONT_FAMILIES.includes(value) && <option value={value}>{value}</option>}
      {FONT_FAMILIES.map((family) => (
        <option key={family} value={family} style={{ fontFamily: family }}>
          {family}
        </option>
      ))}
    </select>
  )
}

/** Marker of one end of the selected edges; empty when they have different markers. */
function MarkerSelect({
  label,
  end,
  value,
  editor,
}: {
  label: string
  end: EdgeEnd
  value: string | null
  editor: DiagramEditor | null
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {label}
      <select
        aria-label={`${label} связи`}
        className="h-8 rounded-md border bg-background px-2 text-foreground"
        value={value ?? ''}
        onChange={(event) => editor?.setEdgeMarker(end, event.target.value)}
      >
        {value === null && <option value="">—</option>}
        {EDGE_MARKERS.map((marker) => (
          <option key={marker.value} value={marker.value}>
            {marker.label}
          </option>
        ))}
      </select>
    </label>
  )
}
