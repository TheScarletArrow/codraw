import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { DiagramEditor } from '../diagram/editor.ts'
import { planViewFromParams, writePlanViewParam, type PlanView } from '../diagram/plan.ts'

/**
 * How the participant shows the page — as it is, as it will be, or with the difference (see `plan.ts`) — kept in the
 * address of the board as the page is: a link opens the same view, and so does a reload. The editor of every page that
 * opens shows the page so.
 */
export function usePlanView(editor: DiagramEditor | null) {
  const [searchParams, setSearchParams] = useSearchParams()
  const addressed = planViewFromParams(searchParams)
  // The router changes the address in a transition, after the choice: until it does, the page shows the choice, so that
  // the choice is checked at once. Any change of the address ends it.
  const [chosen, setChosen] = useState<{ view: PlanView; at: PlanView } | null>(null)
  if (chosen && chosen.at !== addressed) setChosen(null)
  const view = chosen && chosen.at === addressed ? chosen.view : addressed
  useEffect(() => {
    editor?.setPlanView(view)
  }, [editor, view])
  const changeView = useCallback(
    (next: PlanView) => {
      setChosen({ view: next, at: addressed })
      setSearchParams(
        (params) => {
          const changed = new URLSearchParams(params)
          writePlanViewParam(changed, next)
          return changed
        },
        { replace: true },
      )
    },
    [setSearchParams, addressed],
  )
  return { view, changeView }
}
