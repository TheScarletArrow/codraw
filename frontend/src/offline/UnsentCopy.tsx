import { useEffect, useState, type AriaRole } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { downloadDrawio } from '../drawio/files.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { embeddedImages } from '../image/inlineImages.ts'
import { deleteLocalCopy, findLocalCopy, loadLocalCopy } from './localCopies.ts'

/** Why the edits of the copy did not go to the board. */
export type UnsentCopyReason = 'no-edit-right' | 'kept'

const MESSAGES: Record<UnsentCopyReason, string> = {
  'no-edit-right': 'Правки, сделанные без связи, не отправлены: у вас больше нет права правки',
  kept: 'Неотправленные правки остались в копии доски на этом устройстве',
}

interface UnsentCopyProps {
  userId: string
  boardId: string
  /** The title of the board, which names the downloaded file; without it, the title the copy recorded does. */
  title?: string
  reason: UnsentCopyReason
  /**
   * The participant can no longer open the board: it was deleted, or gives them no access. A copy without unsent edits
   * is of no use then, and is deleted at once.
   */
  dropSent?: boolean
  /** The copy was deleted from the device. */
  onDeleted?: () => void
  role?: AriaRole
  className?: string
}

/**
 * Offers the local copy of a board whose edits cannot go to the board to download it as `.drawio` or to delete it.
 * Shows nothing when the copy holds no unsent edits: then there is nothing to lose.
 */
export function UnsentCopy({ userId, boardId, title, reason, dropSent = false, onDeleted, role, className }: UnsentCopyProps) {
  const [copy, setCopy] = useState(() => findLocalCopy(userId, boardId))
  useEffect(() => {
    if (dropSent && copy && !copy.pending) void deleteLocalCopy(userId, boardId)
  }, [dropSent, copy, userId, boardId])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!copy?.pending) return null

  const download = async () => {
    setFailed(false)
    setBusy(true)
    try {
      const document = await loadLocalCopy(userId, boardId)
      // Pictures that the browser keeps go into the file; the others stay addresses of the board.
      downloadDrawio(title ?? copy.title, exportDrawio(document, await embeddedImages(document)))
      document.destroy()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    await deleteLocalCopy(userId, boardId)
    setCopy(null)
    onDeleted?.()
  }

  return (
    <div role={role} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
      <span className="min-w-0 flex-1">{MESSAGES[reason]}</span>
      {confirming ? (
        <>
          <span>Удалить копию? Правки из неё пропадут.</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => void remove()}
            disabled={busy}
          >
            Удалить
          </Button>
        </>
      ) : (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => void download()} disabled={busy}>
            Скачать копию (.drawio)
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
            Удалить копию с устройства
          </Button>
        </>
      )}
      {failed && <span className="w-full">Не удалось прочитать копию</span>}
    </div>
  )
}
