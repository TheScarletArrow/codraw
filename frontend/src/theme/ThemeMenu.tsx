import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { themeMessages as m } from './messages.ts'
import { setThemeChoice, THEME_CHOICES, themeChoiceLabel, useThemeChoice, type ThemeChoice } from './theme.ts'

const ICONS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon }

/**
 * «Тема» in the menu of the user: «Как в системе», «Светлая» or «Тёмная», applied at once and remembered in this browser.
 * The button shows the icon of the choice.
 */
export function ThemeMenu({ className }: { className?: string }) {
  const choice = useThemeChoice()
  const Icon = ICONS[choice]
  const label = themeChoiceLabel(choice)

  return (
    <Popover>
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
      <PopoverContent align="end" aria-label={m.theme} className="w-52 p-1">
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
      </PopoverContent>
    </Popover>
  )
}
