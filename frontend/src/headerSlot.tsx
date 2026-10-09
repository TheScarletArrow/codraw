import { createContext, use, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** The place in the header of the app where a page shows something of its own, e.g. who is on the board. */
const HeaderSlot = createContext<HTMLElement | null>(null)

/** Gives the pages inside the place for them in the header of the app. */
export function HeaderSlotProvider({ slot, children }: { slot: HTMLElement | null; children: ReactNode }) {
  return <HeaderSlot value={slot}>{children}</HeaderSlot>
}

/** Shows the children in the header of the app; a page rendered without the header shows them in place. */
export function InHeader({ children }: { children: ReactNode }) {
  const slot = use(HeaderSlot)
  return slot ? createPortal(children, slot) : children
}
