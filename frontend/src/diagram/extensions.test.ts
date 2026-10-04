import { EdgeMarkerRegistry, Point, ShapeRegistry, type AbstractCanvas2D, type Shape } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import { crowsFoot, EDGE_MARKERS, registerDiagramExtensions, SYSTEM_DESIGN_SHAPES } from './extensions.ts'
import { SHAPES } from './shapes.ts'

/** Records the path drawn by a marker. */
function recordingCanvas() {
  const calls: string[] = []
  const record =
    (name: string) =>
    (...args: number[]) =>
      calls.push(`${name}(${args.map((value) => Math.round(value)).join(',')})`)
  const canvas = {
    begin: record('begin'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    ellipse: record('ellipse'),
    stroke: record('stroke'),
  }
  return { canvas: canvas as unknown as AbstractCanvas2D, calls }
}

/** Draws a marker at (100, 0) on an edge that comes from the left; size 6 and width 1 make a unit of 8. */
function draw(marker: Parameters<typeof crowsFoot>[0]) {
  const { canvas, calls } = recordingCanvas()
  const end = new Point(100, 0)
  crowsFoot(marker)(canvas, null as unknown as Shape, 'ERmany', end, 1, 0, 6, false, 1, false)()
  return { calls, end }
}

describe('diagram extensions', () => {
  it('register the shapes and the crow’s foot markers of draw.io', () => {
    registerDiagramExtensions()

    expect(ShapeRegistry.get('document')).toBeDefined()
    expect(ShapeRegistry.get('mxgraph.c4.person2')).toBeDefined()
    for (const { value } of EDGE_MARKERS.filter((marker) => marker.value.startsWith('ER'))) {
      expect(EdgeMarkerRegistry.get(value)).toBeDefined()
    }
  })

  it('register every system design shape that the palette uses', () => {
    registerDiagramExtensions()

    for (const name of Object.keys(SYSTEM_DESIGN_SHAPES)) expect(ShapeRegistry.get(name)).toBe(SYSTEM_DESIGN_SHAPES[name as keyof typeof SYSTEM_DESIGN_SHAPES])
    const builtIn = ['ellipse', 'rhombus', 'cylinder', 'actor', 'cloud', 'hexagon', 'doubleEllipse', 'swimlane', 'document', 'mxgraph.c4.person2']
    for (const shape of SHAPES) {
      const name = shape.style.shape
      if (name) expect([...builtIn, ...Object.keys(SYSTEM_DESIGN_SHAPES)]).toContain(name)
    }
  })

  it('draw «one» as a bar across the edge', () => {
    expect(draw({ bars: [0.5] }).calls).toEqual(['begin()', 'moveTo(96,4)', 'lineTo(96,-4)', 'stroke()'])
  })

  it('draw «many» as prongs that meet one unit before the end', () => {
    expect(draw({ many: true }).calls).toEqual(['begin()', 'moveTo(100,4)', 'lineTo(92,0)', 'lineTo(100,-4)', 'stroke()'])
  })

  it('draw «zero» as a circle and stop the edge at it', () => {
    const { calls, end } = draw({ zero: true })

    expect(calls).toEqual(['begin()', 'moveTo(100,0)', 'lineTo(91,0)', 'stroke()', 'ellipse(85,-3,6,6)', 'stroke()'])
    expect(end.x).toBe(85)
  })
})
