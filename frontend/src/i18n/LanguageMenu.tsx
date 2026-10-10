import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chooseLocale, LOCALE_NAMES, LOCALES, useLocale } from './i18n.ts'
import { languageMessages as m } from './messages.ts'

/**
 * «Язык» in the menu of the user: the languages of the interface by their own names. The choice is remembered in this
 * browser and reloads the page in the new language.
 */
export function LanguageMenu() {
  const current = useLocale()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.current(LOCALE_NAMES[current])}
          title={m.language}
          className="shrink-0"
        >
          <Languages />
          <span className="uppercase">{current}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={m.language} className="w-44 p-1">
        <fieldset className="flex flex-col">
          <legend className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{m.language}</legend>
          {LOCALES.map((option) => (
            <label
              key={option}
              lang={option}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <input
                type="radio"
                name="language"
                value={option}
                checked={current === option}
                onChange={() => chooseLocale(option)}
                className="accent-primary"
              />
              {LOCALE_NAMES[option]}
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}
