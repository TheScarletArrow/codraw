import {
  EdgeMarkerRegistry,
  PerimeterRegistry,
  Point,
  Rectangle,
  ShapeRegistry,
  StyleDefaultsConfig,
  type AbstractCanvas2D,
  type CellState,
  type Shape,
} from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import { crowsFoot, EDGE_MARKERS, registerDiagramExtensions, SYSTEM_DESIGN_SHAPES } from './extensions.ts'
import { SEQUENCE_SHAPE } from './sequence.ts'
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
    rect: record('rect'),
    roundrect: record('roundrect'),
    close: record('close'),
    fillAndStroke: record('fillAndStroke'),
    setDashed: (dashed: boolean) => calls.push(`setDashed(${dashed})`),
    setShadow: () => {},
    save: () => {},
    restore: () => {},
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

  it('draw shadows as draw.io does: black and a quarter opaque', () => {
    registerDiagramExtensions()

    expect(StyleDefaultsConfig.shadowColor).toBe('#000000')
    expect(StyleDefaultsConfig.shadowOpacity).toBe(0.25)
  })

  it('register every system design shape that the palette uses', () => {
    registerDiagramExtensions()

    for (const name of Object.keys(SYSTEM_DESIGN_SHAPES)) expect(ShapeRegistry.get(name)).toBe(SYSTEM_DESIGN_SHAPES[name as keyof typeof SYSTEM_DESIGN_SHAPES])
    // A sequence diagram has shapes of its own; see `sequenceShapes.ts`.
    const builtIn = [
      'ellipse',
      'rhombus',
      'cylinder',
      'actor',
      'cloud',
      'hexagon',
      'doubleEllipse',
      'swimlane',
      'document',
      'image',
      'mxgraph.c4.person2',
      SEQUENCE_SHAPE,
    ]
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

  it('draw a lifeline of draw.io as its header and a dashed line down its middle, with its label in the header', () => {
    registerDiagramExtensions()
    const Lifeline = ShapeRegistry.get('umlLifeline')!
    const lifeline = new Lifeline()
    lifeline.style = { size: 40 } as never
    lifeline.scale = 1
    const { canvas, calls } = recordingCanvas()
    lifeline.paintVertexShape(canvas, 0, 0, 100, 300)
    expect(calls).toEqual(['rect(0,0,100,40)', 'fillAndStroke()', 'setDashed(true)', 'begin()', 'moveTo(50,40)', 'lineTo(50,300)', 'stroke()'])
    expect(lifeline.getLabelBounds(new Rectangle(0, 0, 100, 300))).toMatchObject({ height: 40 })
  })

  it('draw a frame of draw.io with its tab, and an actor as a stick figure', () => {
    registerDiagramExtensions()
    const frame = new (ShapeRegistry.get('umlFrame')!)()
    frame.style = { width: 50, height: 20 } as never
    frame.scale = 1
    const { canvas, calls } = recordingCanvas()
    frame.paintVertexShape(canvas, 0, 0, 300, 200)
    expect(calls.slice(0, 5)).toEqual(['begin()', 'moveTo(0,0)', 'lineTo(50,0)', 'lineTo(50,5)', 'lineTo(40,20)'])
    expect(frame.getLabelBounds(new Rectangle(0, 0, 300, 200))).toMatchObject({ width: 50, height: 20 })
    expect(ShapeRegistry.get('umlActor')).toBeDefined()
  })

  it('end edges on the dashed line of a lifeline, below its header', () => {
    registerDiagramExtensions()
    const perimeter = PerimeterRegistry.get('lifelinePerimeter')!
    const lifeline = { style: { size: 40 }, view: { scale: 1 } } as unknown as CellState
    const bounds = new Rectangle(0, 0, 100, 300)
    expect(perimeter(bounds, lifeline, new Point(400, 120), false)).toMatchObject({ x: 50, y: 120 })
    expect(perimeter(bounds, lifeline, new Point(400, 10), false)).toMatchObject({ x: 50, y: 40 })
  })
})
