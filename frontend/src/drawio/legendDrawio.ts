import { EDGE_API_KEY } from '../diagram/edgeApi.ts'
import {
  layoutLegend,
  LEGEND_DEFAULTS,
  LEGEND_PADDING,
  LEGEND_PART_KEY,
  LEGEND_SHAPE,
  legendItems,
  legendRows,
  legendSettings,
  sampleBox,
  sampleLine,
} from '../diagram/legend.ts'
import { LINK_KEY } from '../diagram/links.ts'
import { LOCKED_KEY } from '../diagram/locks.ts'
import type { CellData, StyleValue } from '../diagram/model.ts'
import { ROTATION_KEY } from '../diagram/rotation.ts'
import { STATUS_KEYS } from '../diagram/status.ts'
import { measureLabel } from '../diagram/textMeasure.ts'

/**
 * A legend in a file of draw.io: a frame with its title and, inside it, what the canvas draws for its rows — samples of
 * shapes in their style, samples of edges with their ends at points, and the names as text — so that draw.io shows the
 * same legend. Every part has {@link LEGEND_PART_KEY}; the frame keeps the mark and the settings of the legend, so that
 * a file of CoDraw brings it back as a legend, which lists the items of its page itself (see {@link isLegendPart}). The
 * page passed is its cells but the root and the layer, in drawing order.
 */

/** Keys of a cell that make it a cell of CoDraw or of its board rather than a look: a sample has none of them. */
const BOARD_KEYS = new Set<string>([LINK_KEY, EDGE_API_KEY, LOCKED_KEY, ROTATION_KEY, ...STATUS_KEYS])

/** The look of a cell for a sample: its style without what makes it a cell of CoDraw, of a board or turned. */
function look(style: Record<string, StyleValue>): Record<string, StyleValue> {
  const own: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(style)) if (!key.startsWith('codraw') && !BOARD_KEYS.has(key)) own[key] = value
  return own
}

/** The frame of a legend: a box of draw.io with the look of the legend, its mark and its settings, holding its parts. */
function frameStyle(style: Record<string, StyleValue>): Record<string, StyleValue> {
  const { shape: _shape, ...own } = style
  return { ...LEGEND_DEFAULTS, ...own, container: true }
}

const vertex = (
  id: string,
  parent: string,
  value: string,
  geometry: { x: number; y: number; width: number; height: number },
  style: Record<string, StyleValue>,
): CellData => ({ id, kind: 'vertex', parent, order: '', value, geometry, source: null, target: null, style })

/**
 * The cells of a legend in a file: the frame first, then its parts. `page` is the cells of its page in drawing order,
 * whose items it lists as the canvas does, laid out anew: the size in the document may be older than the page.
 */
export function legendDrawioCells(legend: CellData, page: readonly CellData[]): CellData[] {
  const records = page.map((cell) => ({ id: cell.id, kind: cell.kind === 'edge' ? ('edge' as const) : ('vertex' as const), parent: cell.parent, style: cell.style }))
  const rows = legendRows(legendItems(records), legendSettings(legend.style))
  const style = frameStyle(legend.style)
  const layout = layoutLegend(legend.value, rows, style, measureLabel)
  const byId = new Map(page.map((cell) => [cell.id, cell]))
  const geometry = legend.geometry ?? { x: 0, y: 0, width: 0, height: 0 }
  const cells: CellData[] = [{ ...legend, style, geometry: { ...geometry, width: layout.width, height: layout.height } }]
  const part = { [LEGEND_PART_KEY]: true }
  const lines = String(style.strokeColor ?? LEGEND_DEFAULTS.strokeColor)
  cells.push(
    vertex(`${legend.id}-line`, legend.id, '', { x: 0, y: layout.header, width: layout.width, height: 1 }, {
      shape: 'line',
      strokeColor: lines,
      strokeWidth: 1,
      ...part,
    }),
  )
  const text = {
    fillColor: 'none',
    strokeColor: 'none',
    align: 'left',
    verticalAlign: 'middle',
    spacing: 0,
    fontColor: style.fontColor ?? '#1f2328',
    ...(style.fontSize !== undefined && { fontSize: style.fontSize }),
    ...(style.fontFamily !== undefined && { fontFamily: style.fontFamily }),
  }
  layout.rows.forEach(({ row, y, height }, index) => {
    const sample = row.cellId ? byId.get(row.cellId) : undefined
    if (row.type === 'shape' && sample) {
      const box = sampleBox(row.ratio, y, height)
      cells.push(vertex(`${legend.id}-sample-${index}`, legend.id, '', box, { ...look(sample.style), ...part }))
    }
    if (row.type === 'edge' && sample) {
      const { x1, x2, y: middle } = sampleLine(y, height)
      cells.push({
        id: `${legend.id}-sample-${index}`,
        kind: 'edge',
        parent: legend.id,
        order: '',
        value: '',
        geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, sourcePoint: { x: x1, y: middle }, targetPoint: { x: x2, y: middle } },
        source: null,
        target: null,
        style: { ...look(sample.style), edgeStyle: 'none', ...part },
      })
    }
    const item = row.type === 'shape' || row.type === 'edge'
    const x = item ? layout.textX : LEGEND_PADDING
    cells.push(
      vertex(`${legend.id}-name-${index}`, legend.id, row.label, { x, y, width: Math.max(1, layout.width - x - LEGEND_PADDING), height }, {
        ...text,
        fontStyle: item ? 0 : 2,
        ...part,
      }),
    )
  })
  return cells
}

const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/** A sample or a name of a legend written by {@link legendDrawioCells}: a file brings the legend back without them. */
export function isLegendPart(style: Readonly<Record<string, unknown>>): boolean {
  return isOn(style[LEGEND_PART_KEY])
}

/** The style of a legend read from a file: the shape of a legend again, without what made it a frame of draw.io. */
export function legendFromFile(style: Record<string, StyleValue>): Record<string, StyleValue> {
  const { container: _container, ...own } = style
  return { ...own, shape: LEGEND_SHAPE }
}
