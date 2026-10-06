import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ConfirmedActionProps {
  label: string
  /** The name of the confirmation. */
  title: string
  /** The button of the confirmation that does it. */
  confirmLabel: string
  variant?: 'default' | 'outline' | 'ghost'
  disabled: boolean
  /** The id of what tells why the action is not available. */
  describedBy?: string
  onConfirm: () => void
  /** What the action does. */
  children: ReactNode
}

/** A button of an action that changes much, e.g. the board for everybody, once the user confirms it. */
export function ConfirmedAction({
  label,
  title,
  confirmLabel,
  variant = 'default',
  disabled,
  describedBy,
  onConfirm,
  children,
}: ConfirmedActionProps) {
  const [confirming, setConfirming] = useState(false)
  return (
    <Popover open={confirming} onOpenChange={setConfirming}>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled} aria-describedby={describedBy}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        <div role="alertdialog" aria-label={title} className="flex flex-col gap-2 p-2">
          <p className="text-sm">{children}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConfirming(false)
                onConfirm()
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
