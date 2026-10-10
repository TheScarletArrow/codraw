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
import { sequenceMessages } from './sequence.messages.ts'

const m = sequenceMessages.tools

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
        <Button type="button" variant="ghost" size="sm" title={m.addParticipant} onClick={() => editor?.addSequenceParticipant()}>
          <Plus />
          {m.participant}
        </Button>
        <Button type="button" variant="ghost" size="sm" title={m.addMessage} onClick={() => editor?.addSequenceMessage()}>
          <Plus />
          {m.message}
        </Button>
        <Button type="button" variant="ghost" size="sm" title={m.addNote} onClick={() => editor?.addSequenceNote()}>
          <Plus />
          {m.note}
        </Button>
        <select
          aria-label={m.frame}
          title={sequence.rows > 0 ? m.wrapRows : m.addFrame}
          className={SELECT}
          value=""
          onChange={(event) => {
            if (event.target.value) editor?.addSequenceFrame(event.target.value as FrameKind)
          }}
        >
          <option value="">{m.framePlaceholder}</option>
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
          title={m.numberingTitle}
          className={toggle(sequence.numbered)}
          onClick={() => editor?.setSequenceNumbering(sequence.diagramId, !sequence.numbered)}
        >
          {m.numbering}
        </Button>
      </fieldset>
      <Button type="button" variant="ghost" size="sm" title={m.copyMermaidTitle} onClick={copyMermaid}>
        {m.copyMermaid}
      </Button>
      {copied && (
        <span role="status" className="text-sm whitespace-nowrap text-muted-foreground">
          {m.copied}
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
      {participant.name || m.unnamed}
    </option>
  ))
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {part.type === 'participant' && (
        <Choice
          label={m.kind}
          name={m.participantKind}
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
          <Choice label={m.from} name={m.sender} value={part.from} onChange={(from) => editor?.setSequenceMessage(part.cellId, { from })}>
            {participants}
          </Choice>
          <Choice label={m.to} name={m.receiver} value={part.to} onChange={(to) => editor?.setSequenceMessage(part.cellId, { to })}>
            {participants}
          </Choice>
          <Choice
            label={m.kind}
            name={m.messageKind}
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
            title={m.activatesTitle}
            className={toggle(part.activates)}
            onClick={() => editor?.setSequenceMessage(part.cellId, { activates: !part.activates })}
          >
            {m.activates}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={part.deactivates}
            title={m.deactivatesTitle}
            className={toggle(part.deactivates)}
            onClick={() => editor?.setSequenceMessage(part.cellId, { deactivates: !part.deactivates })}
          >
            {m.deactivates}
          </Button>
        </>
      )}
      {part.type === 'note' && (
        <>
          <Choice
            label={m.placement}
            name={m.notePlacement}
            value={part.placement}
            onChange={(placement) => editor?.setSequenceNote(part.cellId, { placement: placement as NotePlacement })}
          >
            {NOTE_PLACEMENTS.map((placement) => (
              <option key={placement.value} value={placement.value}>
                {placement.label}
              </option>
            ))}
          </Choice>
          <Choice label={m.participant} name={m.noteParticipant} value={part.from} onChange={(from) => editor?.setSequenceNote(part.cellId, { from })}>
            {participants}
          </Choice>
          {part.placement === 'over' && (
            <Choice label={m.until} name={m.noteLastParticipant} value={part.to} onChange={(to) => editor?.setSequenceNote(part.cellId, { to })}>
              {participants}
            </Choice>
          )}
        </>
      )}
      {part.type === 'frame' && (
        <Choice label={m.kind} name={m.frameKind} value={part.kind} onChange={(kind) => editor?.setSequenceFrame(part.cellId, kind as FrameKind)}>
          {FRAME_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </Choice>
      )}
      {(part.type === 'frame' || part.type === 'branch') && BRANCH_WORDS[part.kind] && (
        <Button type="button" variant="ghost" size="sm" title={m.addBranch(BRANCH_WORDS[part.kind]!)} onClick={() => editor?.addSequenceBranch()}>
          <Plus />
          {m.branch}
        </Button>
      )}
    </>
  )
}
