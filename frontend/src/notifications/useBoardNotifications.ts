import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchNotificationSettings,
  muteBoard,
  NOTIFICATION_SETTINGS_QUERY_KEY,
  unmuteBoard,
} from '../api/notificationSettings.ts'
import { useCurrentUser } from '../auth/session.ts'

/**
 * Whether the notifications of the board go to the email and the chat of the user, and what turns them off or on.
 * `undefined` for a guest and for a user without such channels: there is nothing to turn off.
 */
export function useBoardNotifications(boardId: string): { muted: boolean; onToggle: () => void } | undefined {
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  const account = user.data !== undefined && !user.data.guest
  const settings = useQuery({
    queryKey: NOTIFICATION_SETTINGS_QUERY_KEY,
    queryFn: fetchNotificationSettings,
    enabled: account,
  })
  const toggle = useMutation({
    mutationFn: (mute: boolean) => (mute ? muteBoard(boardId) : unmuteBoard(boardId)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_SETTINGS_QUERY_KEY }),
  })

  if (!account || !settings.data) return undefined
  if (!settings.data.email.channel && !settings.data.webhook.channel) return undefined
  const muted = toggle.isPending
    ? toggle.variables
    : settings.data.mutedBoards.some((board) => board.boardId === boardId)
  return { muted, onToggle: () => toggle.mutate(!muted) }
}
