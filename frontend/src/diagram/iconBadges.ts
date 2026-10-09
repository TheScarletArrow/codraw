import { CellOverlay, ImageBox, InternalEvent, Point, type Cell, type Graph } from '@maxgraph/core'
import {
  BADGE_SIZE,
  badgeImage,
  iconOfShape,
  iconPathNow,
  loadIconPath,
  loadTechIcons,
  techIconsNow,
  wantsIcon,
  type TechIcon,
} from './techIcons.ts'

/** The gap between a badge and the corner of its shape, at 100%. */
const BADGE_INSET = 3

/** The logos of the technologies of the shapes of a page on its canvas; see {@link configureIconBadges}. */
export interface IconBadges {
  /** Resolves once the badges of the page as it is now are drawn: the catalog and the logos it needs are loaded. */
  ready(): Promise<void>
  destroy(): void
}

/**
 * Draws the logo of the technology of each shape that has one, or the logo chosen for it, as a badge in its top right
 * corner (see `techIcons.ts`). The badge is an overlay of maxGraph, not a cell: it follows the shape at any zoom, the
 * document does not change, and images of the page draw it, as overlays are included in them. The catalog and the
 * paths of the logos load lazily, once a shape of the page has a technology; the badges come after them.
 */
export function configureIconBadges(graph: Graph): IconBadges {
  const model = graph.getDataModel()
  // The badge of each shape by its cell, with the logo it shows.
  const shown = new Map<Cell, { slug: string; overlay: CellOverlay }>()
  let destroyed = false
  let scheduled = false
  let drawing: Promise<void> = Promise.resolve()

  const shapes = (): Cell[] => {
    const cells: Cell[] = []
    const visit = (cell: Cell) => {
      for (const child of cell.getChildren()) {
        if (child.isVertex()) cells.push(child)
        visit(child)
      }
    }
    const root = model.getRoot()
    if (root) visit(root)
    return cells
  }

  const show = (cell: Cell, icon: TechIcon, path: string) => {
    const current = shown.get(cell)
    if (current?.slug === icon.slug) return
    if (current) graph.removeCellOverlay(cell, current.overlay)
    const half = BADGE_SIZE / 2
    const overlay = new CellOverlay(
      new ImageBox(badgeImage(icon, path), BADGE_SIZE, BADGE_SIZE),
      icon.title,
      'right',
      'top',
      new Point(-(half + BADGE_INSET), half + BADGE_INSET),
      'default',
    )
    graph.addCellOverlay(cell, overlay)
    shown.set(cell, { slug: icon.slug, overlay })
  }

  const hide = (cell: Cell) => {
    const current = shown.get(cell)
    if (!current) return
    graph.removeCellOverlay(cell, current.overlay)
    shown.delete(cell)
  }

  /** Draws the badges whose logos are at hand; returns the logos still to load, `null` while the catalog is. */
  const apply = (): Set<string> | null => {
    const cells = shapes()
    const icons = techIconsNow()
    if (!icons) {
      if (cells.some((cell) => wantsIcon(cell.getStyle() as Record<string, unknown>, String(cell.getValue() ?? '')))) return null
      for (const cell of [...shown.keys()]) hide(cell)
      return new Set()
    }
    const missing = new Set<string>()
    const present = new Set(cells)
    for (const cell of cells) {
      const icon = iconOfShape(icons, cell.getStyle() as Record<string, unknown>, String(cell.getValue() ?? ''))
      const path = icon && iconPathNow(icon.slug)
      if (icon && path) show(cell, icon, path)
      else {
        hide(cell)
        if (icon) missing.add(icon.slug)
      }
    }
    for (const cell of [...shown.keys()]) if (!present.has(cell)) hide(cell)
    return missing
  }

  /** Draws the badges, loading the catalog and the logos they need first; resolves once all are drawn. */
  const draw = async (): Promise<void> => {
    for (let round = 0; round < 3 && !destroyed; round++) {
      const missing = apply()
      if (missing === null) await loadTechIcons()
      else if (missing.size > 0) await Promise.all([...missing].map((slug) => loadIconPath(slug)))
      else return
    }
  }

  const schedule = () => {
    if (scheduled || destroyed) return
    scheduled = true
    // One pass after a change of many cells, e.g. a page that is opened or an import.
    drawing = Promise.resolve().then(() => {
      scheduled = false
      return destroyed ? undefined : draw().catch(() => {})
    })
  }

  const onChange = () => schedule()
  model.addListener(InternalEvent.CHANGE, onChange)
  schedule()

  return {
    ready: () => drawing,
    destroy() {
      destroyed = true
      model.removeListener(onChange)
      for (const cell of [...shown.keys()]) hide(cell)
    },
  }
}
