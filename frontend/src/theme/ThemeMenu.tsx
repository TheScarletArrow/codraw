import { MessageCircleHeart, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { feedbackMessages } from '../feedback/messages.ts'
import { LanguageChoices } from '../i18n/LanguageMenu.tsx'
import { themeMessages as m } from './messages.ts'
import { setThemeChoice, THEME_CHOICES, themeChoiceLabel, useThemeChoice, type ThemeChoice } from './theme.ts'

const ICONS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon }

/**
 * «Тема» in the menu of the user: «Как в системе», «Светлая» or «Тёмная», applied at once and remembered in this browser.
 * The button shows the icon of the choice. On a phone it also offers what the header has no room for: «Язык» and, given
 * `onFeedback`, «Обратная связь».
 */
export function ThemeMenu({ className, onFeedback }: { className?: string; onFeedback?: () => void }) {
  const choice = useThemeChoice()
  const Icon = ICONS[choice]
  const label = themeChoiceLabel(choice)
  const [open, setOpen] = useState(false)
  // The menu hands the focus to the window of feedback: taken back to the button, it would close that window.
  const handingOver = useRef(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.current(label)}
          title={m.theme}
          className={cn('shrink-0', className)}
        >
          <Icon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={m.theme}
        className="w-52 p-1"
        onCloseAutoFocus={(event) => {
          if (!handingOver.current) return
          handingOver.current = false
          event.preventDefault()
        }}
      >
        <fieldset className="flex flex-col">
          <legend className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{m.theme}</legend>
          {THEME_CHOICES.map((option) => {
            const OptionIcon = ICONS[option]
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <input
                  type="radio"
                  name="theme"
                  value={option}
                  checked={choice === option}
                  onChange={() => setThemeChoice(option)}
                  className="accent-primary"
                />
                <OptionIcon aria-hidden className="size-4 text-muted-foreground" />
                {themeChoiceLabel(option)}
              </label>
            )
          })}
        </fieldset>
        {/* A phone has no room for «Язык» and «Обратная связь» in the header. */}
        <div className="mt-1 border-t pt-1 sm:hidden">
          <LanguageChoices />
          {onFeedback && (
            <button
              type="button"
              className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-sm border-t px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                handingOver.current = true
                setOpen(false)
                onFeedback()
              }}
            >
              <MessageCircleHeart aria-hidden className="size-4 text-muted-foreground" />
              {feedbackMessages.feedback}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
