import { Filter } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from './editor.ts'
import { FILTER_FACETS, isFilterActive, NO_FILTER, type FilterFacet, type PageFilter } from './pageFilter.ts'
import { pickerMessages } from './pickers.messages.ts'
import { useEditorState } from './useEditorState.ts'

const m = pickerMessages.filter

/**
 * The filter of the page (see `pageFilter.ts`): the values of the tags, kinds, technologies and owners of the elements of
 * the page and of the kinds of its edges, each with how many have it, to choose from; whether what does not match is
 * hidden rather than pale; and how many elements match. The filter is the participant's own: the page keeps it in its
 * address, so `filter` and `onChange` come from there. Viewers filter too.
 */
export function FilterPicker({
  editor,
  filter,
  onChange,
}: {
  editor: DiagramEditor | null
  filter: PageFilter
  onChange: (filter: PageFilter) => void
}) {
  const { filter: shown } = useEditorState(editor)
  const [open, setOpen] = useState(false)
  const active = isFilterActive(filter)
  // Read while the window is open: the state of the editor changes with the page, and so does this.
  const choices = open && editor ? editor.filterChoices(filter) : null
  const toggle = (facet: FilterFacet, value: string, on: boolean) => {
    const values = filter[facet] as string[]
    onChange({ ...filter, [facet]: on ? [...values, value] : values.filter((other) => other !== value) })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.name}
          aria-pressed={active}
          title={active ? m.on : m.title}
          disabled={!editor}
          className="aria-pressed:bg-accent"
        >
          <Filter />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={m.name} className="flex max-h-[70vh] w-80 flex-col gap-3 overflow-y-auto">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {active && shown ? m.matched(shown.matched, shown.total) : m.choose}
        </p>
        {choices &&
          FILTER_FACETS.map((facet) => (
            <fieldset key={facet} className="flex flex-col gap-1">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">{m.facets[facet]}</legend>
              {choices[facet].length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.none}</p>
              ) : (
                choices[facet].map((choice) => (
                  <label key={choice.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(filter[facet] as string[]).includes(choice.value)}
                      onChange={(event) => toggle(facet, choice.value, event.target.checked)}
                    />
                    <span className="min-w-0 truncate">{choice.label}</span>
                    <span aria-hidden className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {choice.count}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
          ))}
        <label className="flex items-center gap-2 border-t pt-3 text-sm">
          <input type="checkbox" checked={filter.hide} onChange={(event) => onChange({ ...filter, hide: event.target.checked })} />
          {m.hide}
        </label>
        <Button type="button" variant="outline" size="sm" disabled={!active} onClick={() => onChange({ ...NO_FILTER, hide: filter.hide })}>
          {m.reset}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
