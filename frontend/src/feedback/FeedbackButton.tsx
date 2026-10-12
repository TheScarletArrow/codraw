import { useMutation } from '@tanstack/react-query'
import { MessageCircleHeart } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FEEDBACK_KINDS, FEEDBACK_TEXT_MAX_LENGTH, sendFeedback, type FeedbackKind } from '../api/feedback.ts'
import { isTooManyRequests } from '../api/http.ts'
import { MAX_PATH } from '../errors/reporting.ts'
import { currentBuild } from '../update/version.ts'
import { feedbackMessages as m } from './messages.ts'

/** How much of the user agent the form shows; the backend keeps more of it. */
const BROWSER_SHOWN = 60

/** The user agent of this browser, cut to what the line of the form shows. */
function browser(): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return agent.length > BROWSER_SHOWN ? `${agent.slice(0, BROWSER_SHOWN - 1)}…` : agent
}

/**
 * «Обратная связь» in the header: a user, a guest too, tells the administrators of the installation about a bug, an idea
 * or anything else. The path of the page without its query, the version of the app and the browser go along, as with
 * reports of errors. The form lives as long as the header, so a text not sent yet stays when the window closes. A phone
 * has no room for the button: «Тема» opens the window there, which hangs from the right edge of the header then.
 */
export function FeedbackButton({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation()
  const page = pathname.slice(0, MAX_PATH)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [text, setText] = useState('')
  const send = useMutation({
    mutationFn: () => sendFeedback({ kind, text: text.trim(), page, appVersion: currentBuild.version }),
    onSuccess: () => {
      setKind('bug')
      setText('')
    },
  })

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // The thanks stay until the window closes, and it opens with the form again.
        if (!next && send.isSuccess) send.reset()
        onOpenChange(next)
      }}
    >
      <PopoverAnchor asChild>
        {/* The button itself, or on a phone a point at the right edge of the header, below it. */}
        <span className="flex shrink-0 max-sm:absolute max-sm:right-2 max-sm:bottom-0">
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={m.feedback} title={m.feedbackHint} className="max-sm:hidden">
              <MessageCircleHeart />
            </Button>
          </PopoverTrigger>
        </span>
      </PopoverAnchor>
      <PopoverContent align="end" aria-label={m.feedback} className="flex w-96 flex-col gap-3">
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
            <p className="text-sm text-muted-foreground">{m.intro}</p>
            <fieldset disabled={send.isPending}>
              <legend className="mb-1 text-sm font-medium">{m.kind}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {FEEDBACK_KINDS.map((option) => (
                  <label key={option} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="feedback-kind"
                      value={option}
                      checked={kind === option}
                      onChange={() => setKind(option)}
                    />
                    {m.kinds[option]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {m.text}
              <textarea
                value={text}
                maxLength={FEEDBACK_TEXT_MAX_LENGTH}
                rows={5}
                disabled={send.isPending}
                onChange={(event) => setText(event.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm font-normal"
              />
            </label>
            <p className="text-xs break-words text-muted-foreground">{m.attached(page, currentBuild.version, browser())}</p>
            <Button type="submit" size="sm" disabled={send.isPending || text.trim() === ''}>
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
