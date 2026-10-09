import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { iconPathNow, loadIconPath, logoImage, NO_ICON, searchIcons, type TechIcon } from '../diagram/techIcons.ts'
import { iconStatus, useTechIcons } from './useTechIcons.ts'

const fieldClass = 'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground'

/** A logo in the color of its brand, once its path is loaded. */
export function LogoPicture({ icon, className = 'size-5' }: { icon: TechIcon; className?: string }) {
  const [path, setPath] = useState(() => iconPathNow(icon.slug))
  useEffect(() => {
    if (!path) void loadIconPath(icon.slug).then(setPath, () => {})
  }, [icon.slug, path])
  return path ? <img src={logoImage(icon, path)} alt="" className={className} /> : <span className={className} />
}

/**
 * The logo of a shape: the logo it shows now — chosen for it, that of its technology, or none — a search of the logos
 * of simple-icons that chooses one, «По технологии», which gives the shape the logo of its technology again, and «Без
 * значка».
 */
export function IconField({
  id,
  icon,
  technology,
  onChange,
}: {
  id: string
  /** A slug, `none`, or `null` for the logo of the technology. */
  icon: string | null
  technology: string
  onChange: (icon: string | null) => void
}) {
  const icons = useTechIcons()
  const [query, setQuery] = useState('')
  const { shown, text } = iconStatus(icons, icon, technology)
  const found = icons && query.trim() !== '' ? searchIcons(icons, query, 6) : []
  const choose = (chosen: TechIcon) => {
    onChange(chosen.slug)
    setQuery('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-sm">
        {shown && <LogoPicture key={shown.slug} icon={shown} />}
        <span>{text}</span>
      </p>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder="Найти логотип: Kafka, Spring…"
        className={fieldClass}
        value={query}
        disabled={!icons}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && found[0]) {
            event.preventDefault()
            choose(found[0])
          } else if (event.key === 'Escape' && query !== '') {
            event.preventDefault()
            event.stopPropagation()
            setQuery('')
          }
        }}
      />
      {found.length > 0 && (
        <ul aria-label="Найденные логотипы" className="flex flex-col gap-0.5">
          {found.map((candidate) => (
            <li key={candidate.slug}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Значок «${candidate.title}»`}
                className="h-7 w-full justify-start px-1.5"
                onClick={() => choose(candidate)}
              >
                <LogoPicture icon={candidate} className="size-4" />
                {candidate.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {icons && query.trim() !== '' && found.length === 0 && <p className="text-xs text-muted-foreground">Логотип не найден</p>}
      <div className="flex flex-wrap gap-1">
        {icon !== null && (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(null)}>
            По технологии
          </Button>
        )}
        {icon !== NO_ICON && (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(NO_ICON)}>
            Без значка
          </Button>
        )}
      </div>
    </div>
  )
}

/** The logo of a shape for a participant who may only view: what it shows and how it got it. */
export function IconView({ icon, technology }: { icon: string | null; technology: string }) {
  const icons = useTechIcons()
  const { shown, text } = iconStatus(icons, icon, technology)
  return (
    <span className="flex items-center gap-2">
      {shown && <LogoPicture key={shown.slug} icon={shown} />}
      {text}
    </span>
  )
}
