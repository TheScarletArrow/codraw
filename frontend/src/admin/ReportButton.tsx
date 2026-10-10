import { useMutation } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isTooManyRequests } from '../api/http.ts'
import { reportBoard, type ReportReason } from '../api/publicBoards.ts'
import { reportMessages as m } from './messages.ts'
import { REPORT_REASONS } from './reports.ts'

/** The longest text of a report, as the backend takes it. */
const MESSAGE_MAX_LENGTH = 1000

/**
 * «Пожаловаться»: a reader of a board shown without a sign-in tells the administrators of the installation what is wrong
 * with it. The form stays sent until the page is opened again.
 */
export function ReportButton({ boardId }: { boardId: string }) {
  const [reason, setReason] = useState<ReportReason>('spam')
  const [message, setMessage] = useState('')
  const send = useMutation({ mutationFn: () => reportBoard(boardId, reason, message.trim()) })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" aria-label={m.report} title={m.report}>
          <Flag />
          {/* A phone keeps the line of the header for the title of the board. */}
          <span className="max-sm:hidden">{m.report}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3" aria-label={m.reportBoard}>
        {send.isSuccess ? (
          <p role="status" className="text-sm">
            {m.sent}
          </p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              send.mutate()
            }}
          >
            <p className="text-sm text-muted-foreground">
              {m.intro}
            </p>
            <fieldset className="flex flex-col gap-1" disabled={send.isPending}>
              <legend className="mb-1 text-sm font-medium">{m.reason}</legend>
              {REPORT_REASONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {m.message}
              <textarea
                value={message}
                maxLength={MESSAGE_MAX_LENGTH}
                rows={4}
                disabled={send.isPending}
                onChange={(event) => setMessage(event.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm font-normal"
              />
            </label>
            <Button type="submit" size="sm" disabled={send.isPending}>
              {m.send}
            </Button>
            {send.isError && (
              <p role="alert" className="text-sm text-destructive">
                {isTooManyRequests(send.error) ? m.tooMany : m.failed}
              </p>
            )}
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
