/**
 * What a participant chooses about the layers of a page for themselves, apart from the document: the layers they show
 * or hide on their own canvas whatever everybody else sees, and the layer new elements go into.
 */
export interface PageLayerView {
  /** The participant's own visibility of a layer: `true` shown, `false` hidden, `undefined` as for everybody. */
  visibility(layerId: string): boolean | undefined
  /** Sets the participant's own visibility of a layer; `undefined` makes it follow the visibility for everybody again. */
  setVisibility(layerId: string, visible: boolean | undefined): void
  /** The layer the participant chose for new elements, or `null` before they chose one. */
  active(): string | null
  setActive(layerId: string | null): void
}

/** Own visibility of layers by page, then by layer, as the browser keeps it for a board. */
type Stored = Record<string, Record<string, boolean>>

/** The key under which the browser keeps the own visibility of the layers of a board for a user. */
export const layerViewsKey = (userId: string, boardId: string) => `codraw:layers:${userId}:${boardId}`

/**
 * The choices of a participant about the layers of the pages of a board (see {@link PageLayerView}). They live as long
 * as the board is open, as the histories of its pages do; with a `storageKey`, the browser keeps the own visibility
 * of the layers for the next visit. A browser that keeps nothing, e.g. in a private window, keeps it for the visit only.
 */
export class LayerViews {
  private readonly storageKey: string | null
  private stored: Stored | null = null
  private readonly active = new Map<string, string | null>()

  constructor(storageKey: string | null = null) {
    this.storageKey = storageKey
  }

  /** The choices about the layers of the page `pageId`. */
  page(pageId: string): PageLayerView {
    return {
      visibility: (layerId) => this.read()[pageId]?.[layerId],
      setVisibility: (layerId, visible) => {
        const stored = this.read()
        const page = { ...stored[pageId] }
        if (visible === undefined) delete page[layerId]
        else page[layerId] = visible
        if (Object.keys(page).length > 0) stored[pageId] = page
        else delete stored[pageId]
        this.write()
      },
      active: () => this.active.get(pageId) ?? null,
      setActive: (layerId) => this.active.set(pageId, layerId),
    }
  }

  private read(): Stored {
    if (this.stored) return this.stored
    this.stored = {}
    if (!this.storageKey) return this.stored
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(this.storageKey) ?? '{}')
      if (isRecord(parsed)) {
        for (const [pageId, layers] of Object.entries(parsed)) {
          if (!isRecord(layers)) continue
          const page = Object.fromEntries(Object.entries(layers).filter(([, visible]) => typeof visible === 'boolean'))
          if (Object.keys(page).length > 0) this.stored[pageId] = page as Record<string, boolean>
        }
      }
    } catch {
      // Nothing kept, or nothing to read: every layer follows the visibility for everybody.
    }
    return this.stored
  }

  private write() {
    if (!this.storageKey || !this.stored) return
    try {
      if (Object.keys(this.stored).length > 0) window.localStorage.setItem(this.storageKey, JSON.stringify(this.stored))
      else window.localStorage.removeItem(this.storageKey)
    } catch {
      // The browser keeps nothing: the choice lasts for this visit.
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
