import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Board } from '../api/boards.ts'
import { createInvite, fetchInvites, limitOf, revokeInvite, type Invite, type MemberRole } from '../api/members.ts'
import { perLocale } from '../i18n/i18n.ts'
import { invitesKey, inviteUrl } from './members.ts'
import { shareMessages as m } from './share.messages.ts'

/** How long «Скопировано» replaces «Копировать», in milliseconds. */
const COPIED_DURATION = 2_000

const timeFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))

/** «Пригласить по ссылке» for the owner: invitation links with a role, which they copy and revoke. */
export function InvitesSection({ board }: { board: Board }) {
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: invitesKey(board.id), queryFn: () => fetchInvites(board.id) })
  const [role, setRole] = useState<MemberRole>('editor')
  const [copied, setCopied] = useState<string | null>(null)
  const refetch = () => queryClient.invalidateQueries({ queryKey: invitesKey(board.id), exact: true })
  const create = useMutation({ mutationFn: (role: MemberRole) => createInvite(board.id, role), onSuccess: refetch })
  const revoke = useMutation({ mutationFn: (invite: Invite) => revokeInvite(board.id, invite.id), onSuccess: refetch })

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(null), COPIED_DURATION)
    return () => clearTimeout(timeout)
  }, [copied])

  const copy = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite))
      setCopied(invite.id)
    } catch {
      // The address is in the field, ready to be copied by hand.
    }
  }

  const limit = limitOf(create.error)
  return (
    <section aria-labelledby="board-invites" className="flex flex-col gap-1.5 border-t pt-3">
      <h3 id="board-invites" className="text-sm font-medium">
        {m.invite}
      </h3>
      <p className="text-xs text-muted-foreground">
        {m.inviteAbout}
      </p>
      <div className="flex gap-2">
        <select
          aria-label={m.inviteRole}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as MemberRole)}
        >
          <option value="editor">{m.roles.editor}</option>
          <option value="viewer">{m.roles.viewer}</option>
        </select>
        <Button type="button" size="sm" disabled={create.isPending} onClick={() => create.mutate(role)}>
          {m.createLink}
        </Button>
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {limit === null
            ? m.inviteFailed
            : m.inviteLimit(limit)}
        </p>
      )}
      {invites.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.invitesLoadFailed}
        </p>
      )}
      {invites.data && invites.data.length > 0 && (
        <ul aria-label={m.invites} className="flex flex-col gap-2">
          {invites.data.map((invite) => {
            const label = `${m.roles[invite.role]}, ${timeFormat().format(new Date(invite.createdAt))}`
            return (
              <li key={invite.id} aria-label={m.inviteItem(label)} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <div className="flex gap-2">
                  <input
                    readOnly
                    aria-label={m.inviteLink(m.roles[invite.role])}
                    value={inviteUrl(invite)}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-muted/50 px-2 text-sm"
                    onFocus={(event) => event.target.select()}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void copy(invite)}>
                    {copied === invite.id ? m.copied : m.copy}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(invite)}
                  >
                    {m.revoke}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {revoke.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.revokeFailed}
        </p>
      )}
    </section>
  )
}
