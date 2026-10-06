import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from '../api/notifications.ts'
import {
  describeNotification,
  NOTIFICATIONS_POLL_INTERVAL,
  notificationLink,
  notificationListKey,
  notificationsKey,
  timeAgo,
  unreadCountKey,
} from './notifications.ts'

/**
 * «Уведомления» in the header of the app: the number of unread notifications, asked for from time to time and when the
 * tab is shown again, and the list of notifications, newest first, which lead to what they tell about.
 */
export function NotificationBell({ className }: { className?: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const unread = useQuery({
    queryKey: unreadCountKey,
    queryFn: fetchUnreadCount,
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL,
  })
  const count = unread.data ?? 0

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void queryClient.invalidateQueries({ queryKey: unreadCountKey })
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={count > 0 ? `Уведомления (${count})` : 'Уведомления'}
          title="Уведомления"
          className={cn('shrink-0', className)}
        >
          <Bell />
          {count > 0 && (
            <span aria-hidden className="min-w-4 rounded-full bg-amber-400 px-1 text-xs leading-4 font-semibold text-amber-950">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Уведомления" className="flex max-h-[80vh] w-96 flex-col p-0">
        <NotificationList unread={count} onLeave={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/** The pages of notifications, fetched while the list is open. */
function NotificationList({ unread, onLeave }: { unread: number; onLeave: () => void }) {
  const queryClient = useQueryClient()
  const list = useInfiniteQuery({
    queryKey: notificationListKey,
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next,
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL,
  })
  const refetch = () => queryClient.invalidateQueries({ queryKey: notificationsKey })
  const read = useMutation({ mutationFn: markNotificationRead, onSettled: refetch })
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSettled: refetch })
  const notifications = list.data?.pages.flatMap((page) => page.notifications) ?? []
  const anyUnread = unread > 0 || notifications.some((notification) => notification.readAt === null)

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="flex-1 text-sm font-semibold">Уведомления</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!anyUnread || readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          Прочитать все
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {list.isPending && <p className="p-2 text-sm text-muted-foreground">Загрузка…</p>}
        {list.isError && (
          <p role="alert" className="p-2 text-sm text-destructive">
            Не удалось загрузить уведомления
          </p>
        )}
        {list.isSuccess && notifications.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">Уведомлений пока нет</p>
        )}
        {notifications.length > 0 && (
          <ul aria-label="Список уведомлений" className="flex flex-col">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  notification={notification}
                  onOpen={() => {
                    if (notification.readAt === null) read.mutate(notification.id)
                    onLeave()
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Показать ещё
          </Button>
        )}
      </div>
    </>
  )
}

function NotificationItem({ notification, onOpen }: { notification: UserNotification; onOpen: () => void }) {
  const text = describeNotification(notification)
  const unread = notification.readAt === null
  return (
    <Link
      to={notificationLink(notification)}
      onClick={onOpen}
      className={cn('flex gap-2 rounded-md p-2 text-left hover:bg-accent', unread && 'bg-primary/5')}
    >
      <ActorAvatar actor={notification.actor} />
      {/* The spaces between the lines keep the words of the name of the link apart; flex boxes do not show them. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm break-words">
          {text.actor && <span className="font-medium">{text.actor}</span>}
          {text.actor ? `: ${text.action}` : text.action}
        </span>{' '}
        {text.detail && <span className="line-clamp-2 text-xs break-words text-muted-foreground">{text.detail}</span>}{' '}
        <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
          {timeAgo(notification.createdAt)}
        </time>
      </span>{' '}
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
          <span className="sr-only">Не прочитано</span>
        </span>
      )}
    </Link>
  )
}

/** The avatar of who did it, the first letter of their name without one, a bell when nobody is named. */
function ActorAvatar({ actor }: { actor: UserNotification['actor'] }) {
  if (actor?.avatarUrl) return <img src={actor.avatarUrl} alt="" className="size-7 shrink-0 rounded-full" />
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
      {actor ? actor.name.charAt(0).toUpperCase() : <Bell className="size-3.5" />}
    </span>
  )
}
