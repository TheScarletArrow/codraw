import { useEffect, useState } from 'react'
import { elementsMessages as m } from './messages.ts'
import { iconOfTechnology, loadTechIcons, NO_ICON, techIconsNow, type TechIcon, type TechIconCatalog } from '../diagram/techIcons.ts'

/** The catalog of the logos, loaded once `load` asks for it, e.g. once something shows it or a search starts. */
export function useTechIcons(load = true): TechIconCatalog | null {
  const [icons, setIcons] = useState(techIconsNow)
  useEffect(() => {
    if (load && !icons) void loadTechIcons().then(setIcons, () => {})
  }, [load, icons])
  return icons
}

/** The logo a shape shows, and how it got it: chosen, by its technology, or none. */
export function iconStatus(
  icons: TechIconCatalog | null,
  icon: string | null,
  technology: string,
): { shown: TechIcon | null; text: string } {
  if (!icons) return { shown: null, text: m.loadingLogos }
  if (icon === NO_ICON) return { shown: null, text: m.noIcon }
  const chosen = icon ? (icons.bySlug.get(icon) ?? null) : null
  if (chosen) return { shown: chosen, text: chosen.title }
  const auto = technology ? iconOfTechnology(icons, technology) : null
  if (auto) return { shown: auto, text: m.autoLogo(auto.title) }
  return { shown: null, text: technology ? m.noLogoFor(technology) : m.chooseTechnology }
}

