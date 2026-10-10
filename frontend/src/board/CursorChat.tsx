import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import type { DiagramEditor, Point } from '../diagram/editor.ts'
import { takesText } from '../lib/keyboard.ts'
import { throttle } from '../lib/throttle.ts'
import { CHAT_INTERVAL_MS, CHAT_MAX_LENGTH, type Awareness, type ChatMessage } from './presence.ts'
import { boardMessages } from './board.messages.ts'

/** How long a message stays at the cursor after Enter. */
export const CHAT_KEEP_MS = 5000

/** The message of the participant: typed in its field while it is open, then shown until it expires. */
interface OwnChat {
  text: string
  /** When the participant started it (ms): tells it from their previous one. */
  at: number
  open: boolean
}

interface CursorChatProps {
  editor: DiagramEditor | null
  awareness: Awareness | null
  /** The board is connected; when the connection is lost, the message goes. */
  online: boolean
  /** The color of the participant, of their bubble. */
  color: string
}

/**
 * A short message at the cursor. `/` on the canvas opens a field at the pointer, and the others on the same page see
 * what the participant types at their cursor as they type it. Enter keeps the message for a few seconds, Escape removes
 * it at once, and so do another page and a lost connection. The field and the bubble follow the pointer and never take
 * it: over them, the pointer would leave the canvas, and the others would lose the cursor with its message.
 */
export function CursorChat({ editor, awareness, online, color }: CursorChatProps) {
  const [chat, setChat] = useState<OwnChat | null>(null)
  const [anchor, setAnchor] = useState<Point | null>(null)
  // The message goes with the canvas of its page and with the connection.
  const [scope, setScope] = useState({ editor, online })
  if (scope.editor !== editor || scope.online !== online) {
    setScope({ editor, online })
    setChat(null)
  }
  const shown = chat !== null

  // The last position of the pointer on the canvas: a message opens there, also when the pointer has left the canvas.
  const pointer = useRef<Point | null>(null)
  useEffect(() => {
    pointer.current = null
    return editor?.onPointerMove((point) => {
      if (point) pointer.current = point
    })
  }, [editor])
  // The message follows the pointer.
  useEffect(() => {
    if (!editor || !shown) return
    return editor.onPointerMove((point) => {
      if (point) setAnchor(point)
    })
  }, [editor, shown])

  useEffect(() => {
    if (!editor) return
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || takesText(event.target)) return
      // Neither a character in the field about to open nor the quick find of Firefox.
      event.preventDefault()
      setAnchor(pointer.current ?? editor.viewportCenter())
      setChat({ text: '', at: Date.now(), open: true })
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [editor])

  // A sent message goes after a while; a new one replaces it.
  const sent = shown && !chat.open
  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setChat(null), CHAT_KEEP_MS)
    return () => clearTimeout(timer)
  }, [sent])

  useChatPublisher(awareness, chat && chat.text.trim() !== '' ? chat.text : null, chat?.at ?? 0)

  // Enter and a click past the field keep what was typed; an empty message just closes.
  const send = () =>
    setChat((current) => (!current?.open ? current : current.text.trim() ? { ...current, open: false } : null))
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
      editor?.focus()
    } else if (event.key === 'Escape') {
      // The message only: neither following nor the laser pointer end.
      event.stopPropagation()
      setChat(null)
      editor?.focus()
    }
  }

  if (!editor || !chat || !anchor) return null
  return (
    <AtPointer editor={editor} anchor={anchor}>
      {chat.open ? (
        <input
          // The field opens on a key, to be typed in at once.
          autoFocus
          aria-label={boardMessages.cursorChat}
          placeholder={boardMessages.cursorChatPlaceholder}
          maxLength={CHAT_MAX_LENGTH}
          value={chat.text}
          onChange={(event) => {
            const text = event.target.value.slice(0, CHAT_MAX_LENGTH)
            setChat((current) => current && { ...current, text })
          }}
          onKeyDown={handleKeyDown}
          onBlur={send}
          className={`${BUBBLE_CLASS} field-sizing-content max-w-72 min-w-40 outline-none placeholder:text-white/75`}
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          data-testid="own-chat"
          className={`${BUBBLE_CLASS} w-max max-w-60 break-words`}
          style={{ backgroundColor: color }}
        >
          {chat.text}
        </span>
      )}
    </AtPointer>
  )
}

/** The bubble of a message, below and to the right of the pointer, where the others see the name at a cursor. */
const BUBBLE_CLASS = 'absolute top-4 left-3 rounded-xl rounded-tl-sm px-2 py-1 text-sm text-white shadow-sm'

/** A layer over the canvas that never takes the pointer, with its content at a point of the diagram. */
function AtPointer({ editor, anchor, children }: { editor: DiagramEditor; anchor: Point; children: ReactNode }) {
  // The point moves on the screen with scrolling and zoom.
  useSyncExternalStore(editor.onViewChange, () => editor.getViewVersion())
  const { x, y } = editor.toCanvasPoint(anchor)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-0 left-0" style={{ transform: `translate(${x}px, ${y}px)` }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Publishes the message with its text as `chat`, at most {@link CHAT_INTERVAL_MS} apart while it is typed. Its removal
 * goes at once, and so it does when the participant leaves the board.
 */
function useChatPublisher(awareness: Awareness | null, text: string | null, at: number) {
  const publish = useRef<((message: ChatMessage | null) => void) | null>(null)
  useEffect(() => {
    if (!awareness) return
    let latest: ChatMessage | null = null
    const throttled = throttle(() => awareness.setLocalStateField('chat', latest), CHAT_INTERVAL_MS)
    publish.current = (message) => {
      if (message === null && latest === null) return
      latest = message
      if (message) {
        throttled.run()
      } else {
        throttled.cancel()
        awareness.setLocalStateField('chat', null)
      }
    }
    return () => {
      publish.current = null
      throttled.cancel()
      if (latest) awareness.setLocalStateField('chat', null)
    }
  }, [awareness])
  useEffect(() => {
    publish.current?.(text === null ? null : { text, at })
  }, [awareness, text, at])
}
