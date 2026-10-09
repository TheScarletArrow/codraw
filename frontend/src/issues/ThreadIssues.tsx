import { useMemo } from 'react'
import type { CommentThread } from '../api/comments.ts'
import { AddIssue } from './AddIssue.tsx'
import { IssueLinkList } from './IssueLinkList.tsx'
import { isOf } from './issues.ts'
import { useBoardIssues, useTrackerSettings } from './useIssues.ts'

/**
 * The issues linked to a thread of comments, and linking or creating more: everybody who may comment does, and the
 * user who linked an issue unlinks it, as do those who edit the board. Without the issues of a board around it, e.g. in a
 * draft of a proposal, the thread shows none.
 */
export function ThreadIssues({ thread }: { thread: CommentThread }) {
  const issues = useBoardIssues()
  const settings = useTrackerSettings(issues !== null && !issues.guest)
  const target = useMemo(() => ({ threadId: thread.id }), [thread.id])
  const links = useMemo(() => issues?.links.filter((link) => isOf(link, target)) ?? [], [issues, target])
  if (!issues) return null
  const connected = settings.data?.connection?.working === true
  // Nothing to show and nothing to do: a guest links nothing, and neither does anybody when the tracker is off.
  if (links.length === 0 && (issues.guest || settings.data?.available === false)) return null

  return (
    <div className="flex flex-col gap-1.5 px-1">
      <IssueLinkList
        boardId={issues.boardId}
        links={links}
        canUnlink={(link) => issues.canEdit || link.linkedBy?.id === issues.userId}
        canTakeOver={connected}
        onChanged={issues.onChanged}
      />
      <AddIssue
        boardId={issues.boardId}
        target={target}
        guest={issues.guest}
        defaultTitle={thread.comments[0]?.body.split('\n')[0] ?? ''}
        compact
        onChanged={issues.onChanged}
      />
    </div>
  )
}
