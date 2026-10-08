import { Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { writeSystemClipboard } from './clipboard.ts'
import type { DiagramEditor, SelectedSequence, SequencePartState } from './editor.ts'
import {
  BRANCH_WORDS,
  FRAME_KINDS,
  MESSAGE_ARROWS,
  NOTE_PLACEMENTS,
  PARTICIPANT_KINDS,
  type FrameKind,
  type MessageArrow,
  type NotePlacement,
  type ParticipantKind,
} from './sequence.ts'

/** How long «Mermaid скопирован» stays after copying, in milliseconds. */
const COPIED_FOR = 2000

const SELECT = 'h-8 max-w-44 rounded-md border bg-background px-2 text-foreground'
const FIELDSET = 'flex shrink-0 items-center gap-1'
const toggle = (pressed: boolean) => cn(pressed && 'bg-accent text-accent-foreground')

/**
 * The tools of the selected sequence diagram: new participants, messages, notes and frames, the numbers of messages and
 * the copy as Mermaid, then the properties of the selected part — the kind of a participant; the sender, the receiver,
 * the kind and the activations of a message; where a note stands; the kind and the branches of a frame. A locked diagram
 * keeps only the copy as Mermaid.
 */
export function SequenceTools({ editor, sequence }: { editor: DiagramEditor | null; sequence: SelectedSequence }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR)
    return () => clearTimeout(timer)
  }, [copied])
  const copyMermaid = () => {
    const text = editor?.sequenceMermaid(sequence.diagramId)
    if (!text) return
    writeSystemClipboard(text)
    setCopied(true)
  }

  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <fieldset disabled={!sequence.canChange} className={FIELDSET}>
        <Button type="button" variant="ghost" size="sm" title="Добавить участника" onClick={() => editor?.addSequenceParticipant()}>
          <Plus />
          Участник
        </Button>
        <Button type="button" variant="ghost" size="sm" title="Добавить сообщение" onClick={() => editor?.addSequenceMessage()}>
          <Plus />
          Сообщение
        </Button>
        <Button type="button" variant="ghost" size="sm" title="Добавить заметку" onClick={() => editor?.addSequenceNote()}>
          <Plus />
          Заметка
        </Button>
        <select
          aria-label="Рамка"
          title={sequence.rows > 0 ? 'Обернуть выделенные строки в рамку' : 'Добавить рамку'}
          className={SELECT}
          value=""
          onChange={(event) => {
            if (event.target.value) editor?.addSequenceFrame(event.target.value as FrameKind)
          }}
        >
          <option value="">Рамка…</option>
          {FRAME_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={sequence.numbered}
          title="Номера сообщений по порядку"
          className={toggle(sequence.numbered)}
          onClick={() => editor?.setSequenceNumbering(sequence.diagramId, !sequence.numbered)}
        >
          Нумерация
        </Button>
      </fieldset>
      <Button type="button" variant="ghost" size="sm" title="Скопировать как Mermaid sequenceDiagram" onClick={copyMermaid}>
        Скопировать Mermaid
      </Button>
      {copied && (
        <span role="status" className="text-sm whitespace-nowrap text-muted-foreground">
          Mermaid скопирован
        </span>
      )}
      {sequence.part && (
        <fieldset disabled={!sequence.canChange} className={FIELDSET}>
          <PartTools editor={editor} sequence={sequence} part={sequence.part} />
        </fieldset>
      )}
    </>
  )
}

/** A list of the toolbar with its name before it. */
function Choice({ label, name, value, onChange, children }: { label: string; name: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
      {label}
      <select aria-label={name} className={SELECT} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  )
}

function PartTools({ editor, sequence, part }: { editor: DiagramEditor | null; sequence: SelectedSequence; part: SequencePartState }) {
  const participants = sequence.participants.map((participant) => (
    <option key={participant.key} value={participant.key}>
      {participant.name || 'Без имени'}
    </option>
  ))
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {part.type === 'participant' && (
        <Choice
          label="Вид"
          name="Вид участника"
          value={part.kind}
          onChange={(kind) => editor?.setSequenceParticipant(part.cellId, { kind: kind as ParticipantKind })}
        >
          {PARTICIPANT_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </Choice>
      )}
      {part.type === 'message' && (
        <>
          <Choice label="От" name="Отправитель" value={part.from} onChange={(from) => editor?.setSequenceMessage(part.cellId, { from })}>
            {participants}
          </Choice>
          <Choice label="Кому" name="Получатель" value={part.to} onChange={(to) => editor?.setSequenceMessage(part.cellId, { to })}>
            {participants}
          </Choice>
          <Choice
            label="Вид"
            name="Вид сообщения"
            value={part.arrow}
            onChange={(arrow) => editor?.setSequenceMessage(part.cellId, { arrow: arrow as MessageArrow })}
          >
            {MESSAGE_ARROWS.map((arrow) => (
              <option key={arrow.value} value={arrow.value}>
                {arrow.label}
              </option>
            ))}
          </Choice>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={part.activates}
            title="Полоса активации получателя начинается у этого сообщения"
            className={toggle(part.activates)}
            onClick={() => editor?.setSequenceMessage(part.cellId, { activates: !part.activates })}
          >
            Активирует получателя
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={part.deactivates}
            title="Полоса активации отправителя заканчивается у этого сообщения"
            className={toggle(part.deactivates)}
            onClick={() => editor?.setSequenceMessage(part.cellId, { deactivates: !part.deactivates })}
          >
            Завершает активацию отправителя
          </Button>
        </>
      )}
      {part.type === 'note' && (
        <>
          <Choice
            label="Положение"
            name="Положение заметки"
            value={part.placement}
            onChange={(placement) => editor?.setSequenceNote(part.cellId, { placement: placement as NotePlacement })}
          >
            {NOTE_PLACEMENTS.map((placement) => (
              <option key={placement.value} value={placement.value}>
                {placement.label}
              </option>
            ))}
          </Choice>
          <Choice label="Участник" name="Участник заметки" value={part.from} onChange={(from) => editor?.setSequenceNote(part.cellId, { from })}>
            {participants}
          </Choice>
          {part.placement === 'over' && (
            <Choice label="До" name="Последний участник заметки" value={part.to} onChange={(to) => editor?.setSequenceNote(part.cellId, { to })}>
              {participants}
            </Choice>
          )}
        </>
      )}
      {part.type === 'frame' && (
        <Choice label="Вид" name="Вид рамки" value={part.kind} onChange={(kind) => editor?.setSequenceFrame(part.cellId, kind as FrameKind)}>
          {FRAME_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </Choice>
      )}
      {(part.type === 'frame' || part.type === 'branch') && BRANCH_WORDS[part.kind] && (
        <Button type="button" variant="ghost" size="sm" title={`Добавить ветку ${BRANCH_WORDS[part.kind]}`} onClick={() => editor?.addSequenceBranch()}>
          <Plus />
          Ветка
        </Button>
      )}
    </>
  )
}
